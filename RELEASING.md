# Releasing AMA Agent

## Prerequisites

1. All changes committed and pushed to `main`
2. Version numbers updated (if needed)

## Steps to Release

### 1. Update Version Numbers

Update the version in these files following the [Semantic Versioning](https://semver.org/) convention:

- **`package.json`**: `"version": "0.2.0"`
- **`src-tauri/tauri.conf.json`**: `"version": "0.2.0"`
- **`src-tauri/Cargo.toml`**: `version = "0.2.0"`

### 2. Commit Version Bump

```bash
git add -A
git commit -m "chore: bump version to v0.2.0"
git push origin main
```

### 3. Create and Push Git Tag

```bash
git tag v0.2.0
git push origin v0.2.0
```

This triggers the GitHub Actions release workflow.

### 4. Monitor Build

1. Go to **Actions** tab in GitHub
2. Watch the "Release" workflow run
3. Builds run for: Windows, macOS (ARM + Intel), Linux

### 5. Publish Release

1. Go to **Releases** tab
2. Find the draft release created by the workflow
3. Edit release notes if needed
4. Click **Publish release**

## Build Outputs

| Platform | File |
|----------|------|
| Windows | `.msi` installer |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x86_64) |
| Linux | `.AppImage`, `.deb` |

## Caveats

### Windows MSI Versioning
The Windows MSI installer format **requires** version numbers to be purely numeric (format: `Major.Minor.Build`).
- **INVALID**: `0.1.2-alpha`, `0.1.2-beta.1`
- **VALID**: `0.1.2`, `1.0.0`

If you use a non-numeric version string in `package.json` or `tauri.conf.json`, the Windows build will fail during the bundling step. You can still use tagged releases like `v0.1.2-alpha` in Git, but the internal file versions must be numeric.

### Linux Build Dependencies
The Ubuntu runner in **Blacksmith** requires **`libgtk-3-dev`**, which must be installed alongside the other dependencies that the GitHub runner needs.
- This is handled in the GitHub Actions workflow `release.yml`.
- If you see errors about missing `gdk-3.0`, ensure `libgtk-3-dev` is present in the `apt-get install` command.

## Troubleshooting

- **Build fails**: Check Actions logs for errors
- **Missing secrets**: Ensure `GITHUB_TOKEN` has write permissions
- **Rust errors**: May need to update dependencies in `Cargo.toml`
