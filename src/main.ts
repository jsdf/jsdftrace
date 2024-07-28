const url = new URL(window.location.href);

switch (url.searchParams.get('demo')) {
  default:
  case 'scaling':
    import('./ScalingDemo').then((mod) => mod.default());
    break;

  case 'simple':
    import('./SimpleTexDemo').then((mod) => mod.default());
    break;
  case 'canvas':
    import('./CanvasDemo').then((mod) => mod.default());
    break;
}
