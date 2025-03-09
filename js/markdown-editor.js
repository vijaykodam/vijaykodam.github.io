document.addEventListener('DOMContentLoaded', () => {
    const markdownInput = document.getElementById('markdown-input');
    const markdownPreview = document.getElementById('markdown-preview');
    const toolbarButtons = document.querySelectorAll('.toolbar-btn');
    const wordCount = document.getElementById('word-count');
    const charCount = document.getElementById('char-count');
    const cursorPosition = document.getElementById('cursor-position');
    
    // Function to convert markdown to HTML
    function renderMarkdown(markdown) {
        // Basic Markdown conversion
        let html = markdown
            // Headers (h1 to h6)
            .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
            .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Strikethrough
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            // Code blocks with language
            .replace(/```(\w*)\n([\s\S]*?)\n```/g, function(match, lang, code) {
                return `<pre><code class="language-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
            })
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Blockquotes
            .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
            // Unordered lists
            .replace(/^\s*- (.*$)/gm, '<ul><li>$1</li></ul>')
            // Ordered lists
            .replace(/^\s*\d+\. (.*$)/gm, '<ol><li>$1</li></ol>')
            // Task lists
            .replace(/^\s*- \[ \] (.*$)/gm, '<ul class="task-list"><li><input type="checkbox" disabled> $1</li></ul>')
            .replace(/^\s*- \[x\] (.*$)/gm, '<ul class="task-list"><li><input type="checkbox" checked disabled> $1</li></ul>')
            // Horizontal rule
            .replace(/^---$/gm, '<hr>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Images
            .replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
            // Tables
            .replace(/\|(.+)\|(.+)\|/g, '<table><tr><td>$1</td><td>$2</td></tr></table>')
            // Paragraphs (must be last)
            .replace(/^\s*(\n)?(.+)/gm, function(m) {
                return /\<(\/)?(h\d|ul|ol|li|blockquote|pre|table|tr|td|hr)/.test(m) ? m : '<p>' + m + '</p>';
            });

        // Fix nested lists
        html = html.replace(/<\/ul>\s*<ul>/g, '')
            .replace(/<\/ol>\s*<ol>/g, '');
        
        return html;
    }

    // Update preview when markdown input changes
    function updatePreview() {
        const markdown = markdownInput.value;
        const html = renderMarkdown(markdown);
        markdownPreview.innerHTML = html;
        
        // Update word and character counts
        updateCounts();
    }
    
    // Update word and character counts
    function updateCounts() {
        const text = markdownInput.value;
        const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        const charCount = text.length;
        
        document.getElementById('word-count').textContent = `${wordCount} words`;
        document.getElementById('char-count').textContent = `${charCount} characters`;
    }
    
    // Update cursor position
    function updateCursorPosition() {
        const text = markdownInput.value;
        const cursorPos = markdownInput.selectionStart;
        
        // Calculate line and column
        const textBeforeCursor = text.substring(0, cursorPos);
        const lines = textBeforeCursor.split('\n');
        const lineNumber = lines.length;
        const columnNumber = lines[lines.length - 1].length + 1;
        
        cursorPosition.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
    }

    // Insert text at cursor position
    function insertAtCursor(textarea, text) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const selectedText = textarea.value.substring(startPos, endPos);
        
        // For actions that wrap selected text (like bold, italic)
        if (text.includes('url') && text.includes('[') && text.includes(']')) {
            // For links and images
            const replacement = text.replace('url', '').replace('[]', '[' + selectedText + ']');
            textarea.value = textarea.value.substring(0, startPos) + replacement + textarea.value.substring(endPos);
            textarea.selectionStart = startPos + replacement.length;
            textarea.selectionEnd = textarea.selectionStart;
        } else if (text.startsWith('```')) {
            // For code blocks
            const language = text === '```' ? 'javascript' : text.substring(3);
            const replacement = `\`\`\`${language}\n${selectedText}\n\`\`\``;
            textarea.value = textarea.value.substring(0, startPos) + replacement + textarea.value.substring(endPos);
            if (selectedText.length > 0) {
                textarea.selectionStart = startPos + 3 + language.length; // Position after the language
                textarea.selectionEnd = startPos + 3 + language.length; // Position after the language
            } else {
                textarea.selectionStart = startPos + 4 + language.length; // Position at the newline after language
                textarea.selectionEnd = startPos + 4 + language.length; // Position at the newline after language
            }
        } else if (text.indexOf('**') === 0 || text.indexOf('*') === 0 || text.indexOf('~~') === 0 || text.indexOf('`') === 0) {
            // For inline formatting (bold, italic, strikethrough, code)
            const marker = text;
            textarea.value = textarea.value.substring(0, startPos) + marker + selectedText + marker + textarea.value.substring(endPos);
            if (selectedText.length > 0) {
                textarea.selectionStart = startPos;
                textarea.selectionEnd = endPos + (marker.length * 2);
            } else {
                textarea.selectionStart = startPos + marker.length;
                textarea.selectionEnd = textarea.selectionStart;
            }
        } else if (text === '---') {
            // For horizontal rule
            const newLine = (startPos > 0 && textarea.value.charAt(startPos - 1) !== '\n') ? '\n' : '';
            const endNewLine = '\n';
            textarea.value = textarea.value.substring(0, startPos) + newLine + text + endNewLine + textarea.value.substring(endPos);
            textarea.selectionStart = startPos + newLine.length + text.length + endNewLine.length;
            textarea.selectionEnd = textarea.selectionStart;
        } else {
            // For prefixes (headers, lists, quotes)
            const currentLine = textarea.value.substring(0, startPos).lastIndexOf('\n') + 1;
            const lineStart = textarea.value.substring(currentLine, startPos);
            
            if (lineStart.trim() === '') {
                // If at the beginning of a line, just insert the tag
                textarea.value = textarea.value.substring(0, startPos) + text + selectedText + textarea.value.substring(endPos);
                textarea.selectionStart = startPos + text.length + selectedText.length;
                textarea.selectionEnd = textarea.selectionStart;
            } else {
                // If in the middle of a line, insert with a newline
                textarea.value = textarea.value.substring(0, startPos) + '\n' + text + selectedText + textarea.value.substring(endPos);
                textarea.selectionStart = startPos + text.length + 1 + selectedText.length;
                textarea.selectionEnd = textarea.selectionStart;
            }
        }
        
        textarea.focus();
        updatePreview();
        updateCursorPosition();
    }

    // Add table
    function insertTable() {
        const defaultTable = '\n| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n';
        insertAtCursor(markdownInput, defaultTable);
    }

    // Event listeners for toolbar buttons
    toolbarButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const action = button.getAttribute('data-action');
            
            if (action === 'table') {
                insertTable();
            } else {
                const tag = button.getAttribute('data-tag');
                insertAtCursor(markdownInput, tag);
            }
            
            e.preventDefault();
        });
    });

    // Initialize with comprehensive example content
    const sampleContent = `# Markdown Editor

This is a **full-featured** markdown editor with *live preview*.

## Features

- **Bold**, *italic*, and ~~strikethrough~~ text
- [Links](https://example.com) and ![Images](https://via.placeholder.com/150)
- Headers (H1-H6)
- Lists:
  - Unordered lists
  - Ordered lists
  - Tasks lists
- Code blocks with syntax highlighting

### Code Example

\`\`\`javascript
function helloWorld() {
  console.log("Hello, world!");
}
\`\`\`

### Blockquotes

> This is a blockquote.
> It can span multiple lines.

### Tables

| Feature | Description |
| ------- | ----------- |
| Editor  | Markdown input area |
| Preview | Live HTML rendering |
| Toolbar | Formatting options |

### Task List

- [x] Create markdown editor
- [x] Add live preview
- [ ] Implement file save feature

---

## Additional Resources

Use the toolbar above to format your content.`;

    markdownInput.value = sampleContent;
    
    // Set up event listeners
    markdownInput.addEventListener('input', () => {
        updatePreview();
        updateCursorPosition();
    });
    
    markdownInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            insertAtCursor(markdownInput, '    ');
        }
    });
    
    markdownInput.addEventListener('click', updateCursorPosition);
    markdownInput.addEventListener('keyup', updateCursorPosition);
    
    // Initial render
    updatePreview();
    updateCursorPosition();
});