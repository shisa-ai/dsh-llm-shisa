/** CSS modules are transformed by scripts/build.mjs into a class-name map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
