var root = document.getElementById("viewDiv");

require([
  "esri/WebScene",
  "esri/views/SceneView",
  "esri/geometry/Point",
  "esri/Graphic",
  "esri/layers/SceneLayer",
  "esri/core/watchUtils",
  "./VideoTexture/VideoTextureViewModel.js",
], function (
  WebScene,
  SceneView,
  Point,
  Graphic,
  SceneLayer,
  watchUtils,
  Viewshed3DViewModel
) {
  /************************************************************
   * Load a web scene and set it to the map property in a SceneView.
   ************************************************************/
  const scene = new WebScene({
    portalItem: {
      id: "f2220db76c6448b4be8083d19ef4cf8d",
    },
  });
  const view = new SceneView({
    map: scene,
    container: root,
    environment: {
      lighting: {
        directShadowsEnabled: false,
      },
    },
  });

  window.view = view;

  var video = document.createElement("video");
  video.width = 0;
  video.height = 0;
  video.src = "./video.mp4";
  video.autoplay = true;
  video.loop = true;

  document.body.appendChild(video);
  window.video = video;

  const vm = new Viewshed3DViewModel({
    view: view,
  });

  vm.start();

  window.vm = vm;
});
