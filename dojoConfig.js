var dojoConfig = {
  async: 1,

  packages: [
    {
      name: "viewshed",
      location:
        window.location.origin +
        window.location.pathname.replace(/\/[^/]+$/, "") +
        "/Viewshed3D",
    },
    {
      name: "videotexture",
      location:
        window.location.origin +
        window.location.pathname.replace(/\/[^/]+$/, "") +
        "/VideoTexture",
    },
  ],
};
var esriConfig = {
  log: {
    level: "info",
  },
};
