define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/vec4f64",
  "esri/chunks/mat3",
  "esri/chunks/mat3f64",
  "esri/geometry/Mesh",
  "esri/geometry/Point",
], function (vec3, vec3f64, vec4f64, mat3, mat3f64, Mesh, Point) {
  const densifyMaxSegLen = 256;

  const videoCameraAspect = 16 / 9;
  const videoCameraFovX = 120;

  function rad2deg(rad) {
    return (rad * 180) / Math.PI;
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function toDegree(value) {
    return (value * 180) / Math.PI;
  }

  function range(num) {
    const ret = [];

    let i = 0;
    while (i < num) {
      ret.push(i);
      i++;
    }

    return ret;
  }

  function createViewPlane(origin, target) {
    var viewshed = Mesh.createPlane(target, {
      size: 100,
      unit: "meters",
      material: {
        color: "rgba(255,0,0,0.7)",
      },
    });

    // fix plane z-values
    for (let i = 2; i < viewshed.vertexAttributes.position.length; i += 3) {
      viewshed.vertexAttributes.position[i] = target.z;
    }

    var up = vec3f64.fromArray([0, 0, 1]);
    var dir = vec3f64.fromArray([
      target.x - origin.x,
      target.y - origin.y,
      target.z - origin.z,
    ]);
    var a = vec3f64.create();
    var b = vec3f64.create();
    vec3.normalize(a, up);
    vec3.normalize(b, dir);

    var v = vec3f64.create();
    vec3.cross(v, a, b);
    var c = vec3.dot(a, b);

    var vx = mat3f64.fromValues(0, v[2], -v[1], -v[2], 0, v[0], v[1], -v[0], 0);
    var I = mat3f64.fromValues(1, 0, 0, 0, 1, 0, 0, 0, 1);
    var R = mat3f64.create();
    var r2 = mat3f64.create();

    mat3.add(R, I, vx);
    mat3.multiply(r2, vx, vx);
    mat3.multiplyScalar(r2, r2, 1 / (1 + c));
    mat3.add(R, R, r2);

    let theta, phi, chi;
    var sy = Math.sqrt(R[0] * R[0] + R[1] * R[1]);
    var singular = sy < 1e-6;
    if (!singular) {
      theta = Math.atan2(R[5], R[8]);
      chi = Math.atan2(-R[2], sy);
      phi = Math.atan2(R[1], R[0]);
    } else {
      phi = 0;
      theta = Math.atan2(-R[7], R[4]);
      chi = Math.atan2(-R[2], sy);
    }

    theta = rad2deg(theta);
    chi = rad2deg(chi);
    phi = rad2deg(phi);

    viewshed.rotate(theta, 0, phi);

    return viewshed;
  }

  function calculateSightDirections(view, origin, viewshed) {
    const directions = [];

    const vOrigin = vec3f64.create();
    view.renderCoordsHelper.toRenderCoords(origin, vOrigin);
    window.viewshedOb = vOrigin;

    const vCenter = vec3f64.create();
    view.renderCoordsHelper.toRenderCoords(viewshed.extent.center, vCenter);
    window.viewshedTar = vCenter;

    const vDir = vec3f64.create();
    vec3.sub(vDir, vOrigin, vCenter);
    vec3.normalize(vDir, vDir);

    return range(256).map(() => vDir);

    const vertex = viewshed.vertexAttributes.position;
    const diffH = [
      vertex[3] - vertex[0],
      vertex[4] - vertex[1],
      vertex[5] - vertex[2],
    ];
    const diffV = vec3f64.fromArray([
      vertex[6] - vertex[3],
      vertex[7] - vertex[4],
      vertex[8] - vertex[5],
    ]);
    const halfDiffV = vec3f64.create();
    vec3.scale(halfDiffV, diffV, 0.5);

    const calculateHVert = range(densifyMaxSegLen - 2).map((index) => {
      const seg = (index + 1) / (densifyMaxSegLen + 1);
      return [
        vertex[0] + diffH[0] * seg,
        vertex[1] + diffH[1] * seg,
        vertex[2] + diffH[2] * seg,
      ];
    });
    const detailedHPath = [
      [vertex[0], vertex[1], vertex[2]],
      ...calculateHVert,
      [vertex[3], vertex[4], vertex[5]],
    ];

    for (let i = 0; i < detailedHPath.length; i += 1) {
      const dir = vec3f64.fromArray([
        detailedHPath[i][0],
        detailedHPath[i][1],
        detailedHPath[i][2],
      ]);
      vec3.add(dir, dir, halfDiffV);

      view.renderCoordsHelper.toRenderCoords(
        new Point({
          x: dir[0],
          y: dir[1],
          z: dir[2],
          spatialReference: view.spatialReference,
        }),
        dir
      );

      vec3.sub(dir, vOrigin, dir);
      vec3.normalize(dir, dir);
      directions.push(dir);
    }

    return directions;
  }

  function getTilt(p1, p2) {
    const radius = 6378137.0;

    const aLon = toRadians(p1.longitude);
    const aLat = toRadians(p1.latitude);

    const bLon = toRadians(p2.longitude);
    const bLat = toRadians(p2.latitude);

    const cosAb =
      Math.cos(Math.PI / 2 - aLat) * Math.cos(Math.PI / 2 - bLat) +
      Math.sin(Math.PI / 2 - aLat) *
        Math.sin(Math.PI / 2 - bLat) *
        Math.cos(bLon - aLon);
    const sinAb = Math.sqrt(1 - cosAb * cosAb);
    const ab2 =
      (radius + p1.z) * (radius + p1.z) +
      (radius + p2.z) * (radius + p2.z) -
      2 * (radius + p1.z) * (radius + p2.z) * cosAb;
    const sinOba = ((radius + p1.z) / Math.sqrt(ab2)) * sinAb;
    const tilt = toDegree(Math.asin(sinOba));

    return p1.z > p2.z ? tilt : 180 - tilt;
  }

  function getHeading(p1, p2) {
    const atan2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    return 90 - (atan2 * 180) / Math.PI;
  }

  const utils = {
    createViewPlane: createViewPlane,
    calculateSightDirections: calculateSightDirections,
    getHeading: getHeading,
    getTilt: getTilt,
  };

  return utils;
});
