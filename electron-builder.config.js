// electron-builder config — JS form so we can make the signing identity
// conditional on env. When APPLE_TEAM_ID is set (signing-config env file
// sourced), we sign with the matching Developer ID Application identity in the
// keychain and proceed to notarisation. When absent, we explicitly opt out of
// identity discovery so electron-builder ad-hoc-signs the app.
//
// This split exists because the host's keychain has a revoked dev cert that
// auto-discovery would otherwise pick up, breaking the unsigned/work-Mac path.

const signing = process.env.APPLE_TEAM_ID
	? {
			// Match a Developer ID Application identity by team. electron-builder
			// rejects the "Developer ID Application:" prefix — pass just the
			// team-bracketed suffix and it picks the right cert from the keychain.
			identity: `(${process.env.APPLE_TEAM_ID})`,
			hardenedRuntime: true,
			entitlements: "build/entitlements.mac.plist",
			entitlementsInherit: "build/entitlements.mac.plist",
		}
	: {
			// Force ad-hoc signing — bypasses keychain auto-discovery.
			identity: null,
			hardenedRuntime: false,
		};

module.exports = {
	appId: "com.threadbase.menubar",
	productName: "Threadbase Menubar",
	copyright: "Copyright © 2026 Threadbase",
	directories: {
		buildResources: "build",
		output: "release",
	},
	files: [
		"dist/**/*",
		"assets/tray-icon-*.png",
		"package.json",
		"!**/*.map",
		"!**/*.ts",
	],
	asar: true,
	mac: {
		target: [{ target: "dmg", arch: ["universal"] }],
		icon: "build/icon.icns",
		category: "public.app-category.developer-tools",
		gatekeeperAssess: false,
		extendInfo: { LSUIElement: 1 },
		artifactName: "${productName}-${version}-${arch}.${ext}",
		...signing,
	},
	dmg: {
		title: "Threadbase Menubar ${version}",
		writeUpdateInfo: false,
	},
	linux: {
		// Start with x64 only; arm64 AppImage on x64 runner needs qemu and
		// has been finicky. Add arm64 as a follow-up if there's demand.
		target: [{ target: "AppImage", arch: ["x64"] }],
		icon: "build/icon.png",
		category: "Utility",
		artifactName: "${productName}-${version}-${arch}.${ext}",
	},
	win: {
		// Unsigned NSIS installer. Will trigger Windows SmartScreen "Unknown
		// Publisher" warning on download — see README. Code signing requires
		// a paid cert (~$200/yr); revisit when there's demand.
		target: [{ target: "nsis", arch: ["x64"] }],
		// electron-builder auto-generates .ico from this PNG.
		icon: "build/icon.png",
		artifactName: "${productName}-${version}-${arch}.${ext}",
	},
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
		perMachine: false,
	},
	afterSign: "scripts/notarize.cjs",
};
