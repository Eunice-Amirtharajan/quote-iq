import "@testing-library/jest-dom";

globalThis.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
});
