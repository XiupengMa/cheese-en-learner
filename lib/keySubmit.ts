// Submit the surrounding form on Cmd/Ctrl+Enter or Shift+Enter.
//
// Textareas are the real audience (plain Enter inserts a newline there);
// single-line inputs get it too so the shortcut feels uniform everywhere.
// Skips while an IME composition is active — with Chinese input methods,
// Enter-with-modifiers mid-composition must not fire the form.
export function submitOnModEnter(
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  if (e.key !== "Enter") return;
  if (!(e.metaKey || e.ctrlKey || e.shiftKey)) return;
  if (e.nativeEvent.isComposing) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}
