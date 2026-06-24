// Three.js JSX elements — only what we use
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any
      points: any
      pointsMaterial: any
      lineBasicMaterial: any
      group: any
      primitive: any
      color: any
      ambientLight: any
      pointLight: any
      sprite: any
      spriteMaterial: any
    }
  }
}
