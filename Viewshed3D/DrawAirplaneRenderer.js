define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/vec4",
  "esri/chunks/vec4f64",
  "esri/chunks/mat3",
  "esri/chunks/mat3f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/core/Accessor",
  "esri/core/accessorSupport/trackingUtils",
  "esri/core/Evented",
  "esri/core/Logger",
  "esri/core/Handles",
  "esri/core/handleUtils",
  "esri/core/Collection",
  "esri/core/collectionUtils",
  "esri/core/maybe",
  "esri/core/reactiveUtils",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/core/screenUtils",
  "esri/geometry/Point",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/Mesh",
  "esri/Graphic",
  "esri/geometry/SpatialReference",
  "esri/views/layers/support/FeatureFilter",
  "esri/layers/GraphicsLayer",
  "esri/layers/SceneLayer",
  "esri/layers/LineOfSightLayer",
  "esri/layers/LineOfSightTarget",
  "esri/widgets/support/traversalUtils",
  "esri/widgets/support/InteractiveToolViewModel",
  "esri/widgets/LineOfSight/LineOfSightViewModel",
  "esri/views/3d/interactive/analysisTools/lineOfSight/LineOfSightTool",
  "esri/views/3d/externalRenderers",
  "esri/widgets/LineOfSight/LineOfSightTarget",
  "viewshed/Viewshed3DRenderer",
  "viewshed/Viewshed3DTechnique",
  "viewshed/support/viewshed3DMathUtils",
], function (
  vec3,
  vec3f64,
  vec4,
  vec4f64,
  mat3,
  mat3f64,
  mat4,
  mat4f64,
  Accessor,
  trackingUtils,
  Evented,
  Logger,
  Handles,
  handleUtils,
  Collection,
  collectionUtils,
  maybe,
  reactiveUtils,
  watchUtils,
  promiseUtils,
  screenUtils,
  Point,
  Polyline,
  Polygon,
  Mesh,
  Graphic,
  SpatialReference,
  FeatureFilter,
  GraphicsLayer,
  SceneLayer,
  LineOfSightLayer,
  LineOfSightLayerTarget,
  traversalUtils,
  InteractiveToolViewModel,
  LineOfSightViewModel,
  LineOfSightTool,
  externalRenderers,
  LineOfSightTarget,
  Viewshed3DRenderer,
  Viewshed3DTechnique,
  viewshed3DMathUtils
) {
  var logger = Logger.getLogger(
    "geoscene.widgets.Viewshed3D.RendererViewModel"
  );

  function rad2deg(rad) {
    return (rad * 180) / Math.PI;
  }

  function v(q) {
    if (q.suspended) return !1;
    switch (q.type) {
      case "building-scene-3d":
      case "csv-3d":
      case "elevation-3d":
      case "feature-3d":
      case "geojson-3d":
      case "graphics-3d":
      case "integrated-mesh-3d":
      case "ogc-feature-3d":
      case "scene-layer-3d":
      case "scene-layer-graphics-3d":
      case "slice-3d":
      case "stream-3d":
      case "wms-3d":
        return !0;
      case "area-measurement-3d":
      case "base-dynamic-3d":
      case "direct-line-measurement-3d":
      case "imagery-3d":
      case "imagery-tile-3d":
      case "line-of-sight-3d":
      case "map-image-3d":
      case "point-cloud-3d":
      case "tile-3d":
      case "vector-tile-3d":
      case "voxel-3d":
      case "wfs-3d":
      case "wmts-3d":
      case "voxel-3d":
        return !1;
      case "group":
        return q.layerViews.toArray().some((r) => v(r));
      default:
        return !1;
    }
  }

  return Evented.EventedMixin(Accessor).createSubclass({
    declaredClass: "geoscene.widgets.Viewshed3D.RendererViewModel",

    properties: {
      observer: {},
      target: {},
      _renderView: {
        get() {
          var { view } = this;
          if (maybe.isNone(view)) return null;

          var _stage = view._stage;
          return maybe.isNone(_stage) ? null : _stage.renderView;
        },
      },
      _previewing: {
        get() {
          const { view } = this;
          return maybe.isNone(view) || maybe.isNone(view.allLayerViews)
            ? true
            : this._forcePreview ||
                !view.stationary ||
                view.allLayerViews.some((b) => v(b) && b.updating);
        },
      },
      ready: {},
      view: {},
    },

    constructor() {
      this.logger = logger;
      this.supportedViewType = "3d";
      this.unsupportedErrorMessage =
        "Viewshed3DRendererViewModel is only supported in 3D views.";
      this.ready = false;
      this.view = null;
      this.handles = new Handles();

      this._running = true;
      this._forcePreview = false;
      this._stopPreviewingTask = null;
      this.customTechniqueAttached = false;
    },

    initialize() {
      this.handles.add([
        trackingUtils.autorun(() => {
          if (!!this.observer && !!this.target) {
            this.drawAirplane();
          }
        }),
      ]);
    },

    destroy() {},

    drawAirplane() {
      this.view.graphics.removeAll();

      const transformation = mat4f64.create();
      const geographicCoordinates = [
        this.observer.x,
        this.observer.y,
        this.observer.z,
        this.target.x,
        this.target.y,
        this.target.z,
      ];
      const renderCoordinates = new Array(6);
      externalRenderers.toRenderCoordinates(
        this.view,
        geographicCoordinates,
        0,
        SpatialReference.WebMercator,
        renderCoordinates,
        0,
        2
      );

      externalRenderers.renderCoordinateTransformAt(
        this.view,
        [this.observer.x, this.observer.y, this.observer.z],
        SpatialReference.WebMercator,
        transformation
      );
      mat4.invert(transformation, transformation);
      const targetVec4 = vec4f64.fromValues(
        renderCoordinates[3] - renderCoordinates[0],
        renderCoordinates[4] - renderCoordinates[1],
        renderCoordinates[5] - renderCoordinates[2],
        0
      );
      const targetLocalCoords = vec4f64.create();
      vec4.transformMat4(targetLocalCoords, targetVec4, transformation);
      const targetLocalCoordsVec3 = vec3f64.fromValues(
        targetLocalCoords[0],
        targetLocalCoords[1],
        targetLocalCoords[2]
      );
      vec3.normalize(targetLocalCoordsVec3, targetLocalCoordsVec3);
      const heading =
        Math.PI / 2 -
        Math.atan2(targetLocalCoordsVec3[1], targetLocalCoordsVec3[0]);

      this.view.graphics.add(
        new Graphic({
          geometry: this.observer,
          symbol: {
            type: "point-3d",
            symbolLayers: [
              {
                type: "object",
                width: 21.539997100830078 * 3,
                height: 7.0347914695739746 * 3,
                depth: 25.677627563476563 * 3,
                anchor: "origin",
                // heading: (360 + rad2deg(heading)) % 360,
                // tilt: 90 - rad2deg(Math.acos(targetLocalCoordsVec3[2])),
                resource: {
                  href: "https://static.arcgis.com/arcgis/styleItems/RealisticTransportation/web/resource/Airplane_Large_Passenger.json",
                },
              },
            ],
          },
        })
      );
    },
  });
});
