# CleanCopy — Chrome Web Store listing (source of truth)

Everything typed into the Developer Dashboard for this item lives here, so a
later edit or a sibling extension can reuse it.

## Store listing

- **Title** (from manifest): CleanCopy — Copy Page as Markdown
- **Summary** (from manifest, max 132 chars):
  Copy any page's readable content as clean Markdown in one click. Great for pasting into ChatGPT, Claude or your notes.
- **Category**: Tools (fallback: Workflow & Planning)
- **Language**: English
- **Screenshot**: `screenshot-1280x800.png`

### Description

```
CleanCopy turns the page you are reading into clean Markdown and puts it on your clipboard with one click.

Click the toolbar icon and the main content of the page — headings, paragraphs, lists, tables, links, code blocks and quotes — is copied as Markdown. Navigation bars, ads, cookie banners, sidebars and comment sections are left out.

WHAT IT IS GOOD FOR
• Pasting an article into ChatGPT, Claude or another AI assistant without the page clutter
• Saving pages into Obsidian, Notion, Logseq or any Markdown note app
• Quoting documentation in issues, pull requests and chat
• Keeping a readable plain-text copy of something you want to reference later

HOW IT WORKS
1. Open any web page
2. Click the CleanCopy icon
3. Paste

WHAT IT KEEPS
• Headings (H1–H6), bold and italic text
• Links, converted to absolute URLs so they still work after pasting
• Ordered, unordered and nested lists
• Tables, as Markdown tables
• Code blocks and inline code
• Block quotes and images

PRIVATE BY DESIGN
• Everything runs locally in your browser
• No account, no sign-up, no servers
• No analytics, no tracking, no data collection of any kind
• The extension only reads a page when you click its icon, and only that page

CleanCopy does not work on browser-internal pages (such as chrome:// pages) or the Chrome Web Store, because Chrome does not allow extensions to run there.
```

## Privacy practices

- **Single purpose**:
  Copy the main readable content of the current web page to the clipboard as Markdown when the user clicks the toolbar icon.
- **activeTab justification**:
  Used to read the content of the current tab only at the moment the user clicks the extension icon, so the page can be converted to Markdown. The extension has no access to any page the user has not explicitly invoked it on.
- **scripting justification**:
  Used to inject the bundled conversion script into the current tab after the user clicks the icon. The script reads the page's DOM, converts the main content to Markdown, and shows a short confirmation toast. Only code packaged with the extension is injected.
- **offscreen justification**:
  Used to create a temporary offscreen document whose only job is to write the generated Markdown to the clipboard (reason: CLIPBOARD). Service workers cannot access the clipboard directly. The document is closed immediately after the copy.
- **clipboardWrite justification**:
  Used to write the generated Markdown text to the user's clipboard, which is the extension's core function.
- **Remote code**: No, I am not using remote code. All JavaScript is packaged with the extension.
- **Data usage**: none of the listed data types are collected.
- **Certifications** (all three true for this extension):
  - Does not sell or transfer user data to third parties outside approved use cases
  - Does not use or transfer user data for purposes unrelated to the single purpose
  - Does not use or transfer user data to determine creditworthiness or for lending
- **Privacy policy URL**: not required (no user data handled).

## Distribution

- Free, public, all regions.
