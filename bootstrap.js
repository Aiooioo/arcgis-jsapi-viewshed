var root = document.getElementById("viewDiv");

require([
  "esri/WebScene",
  "esri/views/SceneView",
  "esri/geometry/Point",
  "esri/Graphic",
  "esri/core/watchUtils",
  "./Viewshed3D/Viewshed3DViewModel.js",
], function (
  WebScene,
  SceneView,
  Point,
  Graphic,
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
  
  const vm = new Viewshed3DViewModel({
    view: view,
  });

  vm.start();

  window.vm = vm;

  const buttonA = document.getElementById("scenarioA");
  const buttonB = document.getElementById("scenarioB");

  buttonA.addEventListener("click", (event) => {
    vm.stop();
  });
});
