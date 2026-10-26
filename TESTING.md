# Bedrock Workbench — tester guide

## Install

1. Use VS Code 1.95 or newer on 64-bit Windows.
2. If you received the tester ZIP, extract it first.
3. In VS Code, open Extensions, select the `...` menu, then **Install from VSIX...**.
4. Select the supplied `bedrock-workbench-win32-x64-<version>.vsix` file and confirm installation.
5. Run **Developer: Reload Window** from the Command Palette (`Ctrl+Shift+P`).

The VSIX includes the extension, compiler and bundled schemas. You do not need a GitHub account, repository access or an extension source checkout. Node.js with npm is needed only if you want to install Script API typings. Minecraft Bedrock Release or Preview must be installed for deployment into Minecraft.

## First project

1. Run **Bedrock: Create New Project** from the Command Palette.
2. Enter a name and select a parent folder. The wizard creates a new subfolder there and preserves existing folders.
3. Choose Release or Preview, an engine version, an icon, any experiment requirements, and TypeScript, JavaScript or no scripting.
4. If scripting is enabled, choose stable or beta APIs. The wizard can install matching typings or leave installation for later.
5. Review and create the project. Use VS Code's normal Explorer to edit BP and RP files.

For an existing add-on with BP and RP folders, open its folder and run **Bedrock: Initialize Existing Project** instead.

Internet access lets the wizard check current engine versions, API versions and experiment availability. Offline setup supports manual version entry and bundled experiment choices. Enable selected experiments in Minecraft world settings too; the extension records requirements rather than modifying worlds.

## Things to try

- **Build Beta**: verify compilation completes without deploying. Beta icons should be grayscale.
- **Deploy Beta**: verify the project appears in the selected Minecraft installation. Enable Auto deploy to rebuild and deploy saved changes.
- **Deploy Stable** or **Export Stable mcaddon**: choose a version and verify stable names, color icons and the separate stable identity.
- JSON authoring: try completions, Microsoft Learn hovers and **Validate Project**.
- Language files: verify colored key categories and clickable pack references in key hovers.
- Project creation: try scripting and non-scripting projects, cancellation, and selecting a location where the project folder already exists.

If Minecraft's folder is not found, run **Bedrock: Select Minecraft Folder** and select that installation's `com.mojang` folder. Later, use **Bedrock: Install Script API Typings** to install or refresh the matching script types.

## Report feedback

Send the person who provided this build the extension version, VS Code version, Windows version, Minecraft channel/version, steps to reproduce the problem, expected result, and any screenshot or relevant **Output → Bedrock Workbench** messages. Note whether the issue affects a new project or an existing one.
