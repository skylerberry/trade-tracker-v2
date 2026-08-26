export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        location: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        Image: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        HTMLElement: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        DOMParser: "readonly",
        XMLSerializer: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        qrcode: "readonly"
      }
    },
    rules: {
      "complexity": ["error", 10]
    }
  }
];
