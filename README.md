<p align="center">
  <img src="images/icon.png" width="96" alt="Workcard Preview icon">
</p>

<h1 align="center">Workcard Preview</h1>

<p align="center">
  See your <code>.w.md</code> workcards the way the workflow runs them: cards, forms, gates and records.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License: GPLv3"></a>
</p>

Workcards are Markdown files (`.w.md`) that specify reliable AI workflows. This extension styles the built-in
Markdown preview for them. Other Markdown files are left untouched.

## Features

- **Cards** with their `agent/skill` in the corner. Agent cards are purple.
- **Forms** with their name, inputs and the record each input fills.
- **Go/nogo gates** with the `check` bubble before the last branch.
- **In/out bubbles** and **records** with their `select` path.
- **Four targets**, switched from the **W** menu in the top-right corner.

## Targets

| Target    | Shows                                                       |
| --------- | ----------------------------------------------------------- |
| `full`    | Everything, with boxes, bubbles and labels                  |
| `screen`  | Like full, without nested quotes and front matter           |
| `flow`    | Only cards, forms, gates, bubbles and records               |
| `receipt` | Only records, one per line. Printing always uses this target |

## Usage

1. Open a `.w.md` file.
2. Run **Markdown: Open Preview to the Side** (`Ctrl+K V`, or `Cmd+K V` on macOS).
3. Hover the **W** bubble in the top-right corner of the preview and pick a target.

The target is kept while the preview stays open.

## Requirements

VS Code 1.90 or newer.

## Install from a VSIX

```sh
npx @vscode/vsce package
code --install-extension wmd-preview-0.1.0.vsix
```

## Develop

1. Clone this repo and open its folder in VS Code (`code .`). Don't clone it under `~/.vscode/extensions`, VS Code won't load it from there.
2. Press `F5` (**Run Extension**). A second VS Code window opens with the extension loaded.
3. In that window, open a `.w.md` file and run **Markdown: Open Preview to the Side**.
4. After editing `media/`, run **Developer: Reload Window** in the second window.

Report bugs on [GitHub Issues](https://github.com/enterprise-r/project-vscode-wmd-plugin/issues).

## License

[GPL-3.0-only](LICENSE)

## About

Made by [Enterprise-R](https://www.enterprise-r.com). Contact: [info@enterprise-r.com](mailto:info@enterprise-r.com).
