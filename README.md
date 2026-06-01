# Date Prefix Refresh

A small SiYuan plugin that refreshes document title prefixes from SiYuan's internal `updated` field.

Example:

```text
Model Aggregation API → 260526-Model Aggregation API
250901-Model Aggregation API → 260526-Model Aggregation API
```

## Features

The plugin provides two entry points:

- Top-bar button: Refresh document date prefixes
- Command palette: Search for “Refresh document date prefixes”

After clicking, choose a scope:

- Recent 7 days
- Recent 30 days
- Current notebook
- All notebooks

Titles are normalized to:

```text
YYMMDD-original title
```

Existing six-digit date prefixes are replaced rather than stacked.

## Safety rules

The plugin always skips directory/container documents.

In SiYuan, a directory in the document tree is also a document. If a document has child documents, this plugin treats it as a container document and never renames it.

It also skips:

- Daily note titles such as `2026-05-28`
- `未命名`
- `未命名文档`
- Documents without a valid `updated` field
- Documents whose prefix is already correct

## Data source

The plugin uses the `blocks.updated` field in SiYuan's database. The field is usually formatted as:

```text
YYYYMMDDHHmmss
```

The title prefix uses `YYMMDD`.

## Installation

### Marketplace

If listed in the SiYuan marketplace, search for:

```text
日期前缀刷新
```

### Manual installation

Download `package.zip` from Releases, unzip it to:

```text
workspace/data/plugins/siyuandateprefix
```

Restart SiYuan and enable the plugin.

## Development and packaging

This is a plain JavaScript plugin. No build step is required.

Package with:

```bash
zip -r package.zip plugin.json index.js index.css README.md README_zh_CN.md LICENSE icon.png preview.png
```

## License

MIT
