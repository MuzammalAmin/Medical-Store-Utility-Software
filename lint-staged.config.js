// Pre-commit checks on staged files. Windows limits the length of a command
// line, so large commits check the whole project instead of listing every file.
const MAX_FILES = 30;
const quote = (files) => files.map((f) => `"${f}"`).join(' ');

export default {
  '*.{ts,tsx,js,mjs}': (files) =>
    files.length > MAX_FILES
      ? ['eslint . --max-warnings 0', 'prettier --write .']
      : [`eslint --max-warnings 0 ${quote(files)}`, `prettier --write ${quote(files)}`],
  '*.{json,css,md,yml,html}': (files) =>
    files.length > MAX_FILES ? ['prettier --write .'] : [`prettier --write ${quote(files)}`],
};
