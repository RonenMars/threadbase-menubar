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
	await runXcrun([
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
	]);
	console.log(
		`  • notarisation accepted (${Math.round((Date.now() - t0) / 1000)}s)`,
	);

	console.log(`  • stapling ticket to ${appPath}`);
	await runXcrun(["stapler", "staple", appPath]);
	console.log("  • staple complete");
};
