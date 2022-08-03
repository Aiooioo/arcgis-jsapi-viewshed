var root = document.getElementById("viewDiv");

require([
  "esri/WebScene",
  "esri/views/SceneView",
  "esri/widgets/ShadowCast",
], function (WebScene, SceneView, ShadowCast) {
  const view = new SceneView({
    container: root,

    map: new WebScene({
      portalItem: {
        id: "f2220db76c6448b4be8083d19ef4cf8d",
      },
    }),

    qualityProfile: "high",
    environment: {
      lighting: {
        directShadowsEnabled: false,
      },
    },
  });

  const widget = new ShadowCast({ view });
  view.ui.add(widget, "top-right");
  widget.viewModel.date = new Date("May 1, 2021");
});
