// electron-builder afterSign hook: notarises the signed .app via Apple's
// notarytool and staples the ticket so Gatekeeper accepts it offline.
//
// Reads credentials from env (sourced by deploy.sh from ~/.threadbase/menubar-signing.env):
//   APPLE_API_KEY      — path to the .p8 App Store Connect key file
//   APPLE_API_KEY_ID   — the key's ID (10 chars)
//   APPLE_API_ISSUER   — issuer UUID
//
// No-ops gracefully when those env vars are absent — produces an unsigned/
// ad-hoc-signed build that runs locally on the build machine without
// notarisation. This is the work-Mac fallback path.

const { spawn } = require("node:child_process");

function runXcrun(args) {
	return new Promise((resolve, reject) => {
		const child = spawn("xcrun", args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`xcrun ${args[0]} exited ${code}`));
		});
	});
}

// Like runXcrun but captures stdout instead of inheriting it, so the caller can
// parse notarytool's JSON. notarytool submit exits 0 even when the submission is
// rejected (status: Invalid) — the JSON is the only reliable success signal.
function runXcrunCapture(args) {
	return new Promise((resolve, reject) => {
		const child = spawn("xcrun", args, { stdio: ["inherit", "pipe", "inherit"] });
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(`xcrun ${args[0]} exited ${code}`));
		});
	});
}

module.exports = async function notarize(context) {
	const { electronPlatformName, appOutDir, packager } = context;
	if (electronPlatformName !== "darwin") return;

	const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
	if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
		console.log(
			"  • notarize.cjs: APPLE_API_* env vars absent — skipping notarisation",
		);
		return;
	}

	const appName = packager.appInfo.productFilename;
	const appPath = `${appOutDir}/${appName}.app`;
	const zipPath = `${appOutDir}/${appName}.zip`;

	// notarytool requires a zip, pkg, or dmg — not a raw .app
	console.log(`  • zipping ${appPath} for notarisation`);
	await new Promise((resolve, reject) => {
		const child = require("node:child_process").spawn(
			"ditto",
			["-c", "-k", "--keepParent", appPath, zipPath],
			{ stdio: "inherit" },
		);
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ditto exited ${code}`))));
	});

	console.log(`  • notarising ${appPath} (typically takes 1–5 minutes)`);

	const t0 = Date.now();
	const submitOut = await runXcrunCapture([
		"notarytool",
		"submit",
		zipPath,
		"--key",
		APPLE_API_KEY,
		"--key-id",
		APPLE_API_KEY_ID,
		"--issuer",
		APPLE_API_ISSUER,
		"--wait",
		"--output-format",
		"json",
	]);

	// `notarytool submit` exits 0 for any *processed* submission, including
	// rejected ones (status: Invalid). Stapling a rejected build then fails with
	// exit 65 forever. Gate on the real status and fail loudly with the request
	// id so the rejection log is one `notarytool log <id>` away.
	const { id, status } = JSON.parse(submitOut);
	if (status !== "Accepted") {
		throw new Error(
			`notarisation ${status} (id ${id}) — run: xcrun notarytool log ${id} --key … --key-id … --issuer …`,
		);
	}
	console.log(
		`  • notarisation accepted (${Math.round((Date.now() - t0) / 1000)}s)`,
	);

	// The notarytool ticket takes 30–120s to propagate to Apple's CloudKit CDN
	// after notarisation reports success. Stapling before then fails with exit 65
	// ("Record not found"). Retry until the ticket lands.
	// ponytail: max ~5-min retry window (10 × 30s); shorten the delay if Apple's CDN gets faster.
	console.log(`  • stapling ticket to ${appPath}`);
	for (let attempt = 1; ; attempt++) {
		try {
			await runXcrun(["stapler", "staple", appPath]);
			break;
		} catch (err) {
			if (attempt >= 10) throw err;
			console.log(`  • staple attempt ${attempt} failed (${err.message}); retrying in 30s`);
			await new Promise((r) => setTimeout(r, 30_000));
		}
	}
	console.log("  • staple complete");
};
