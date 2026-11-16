{
  "root": true,
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react/recommended", "plugin:react-hooks/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react", "react-hooks"],
  "settings": { "react": { "version": "18.3" } },
  "env": { "browser": true, "es2022": true }
}
