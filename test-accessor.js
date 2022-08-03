require([
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/Handles",
  "esri/core/reactiveUtils",
  "esri/core/accessorSupport/trackingUtils",
  "esri/core/watchUtils",
], function (
  Accessor,
  Evented,
  Handles,
  reactiveUtils,
  trackingUtils,
  watchUtils
) {
  const OuterVm = Accessor.createSubclass({
    declaredClass: "outer.viewModel",

    properties: {
      p1: {},
      p2: {},
    },

    constructor() {
      this.p1 = 1;
      this.p2 = 2;

      this.handles = new Handles();

      this.init();
      this.initInner();
    },

    init() {
      this.handles.add([
        watchUtils.watch(this, ["p1", "p2"], () => {
          if (this.vm2) {
            this.vm2.p1 = this.p1;
            this.vm2.p2 = this.p2;
          }
        }),
      ]);
    },

    initInner() {
      this.vm1 = new InnerVm1();
      this.vm1.on("evt", ({ p1, p2 }) => {
        this.p1 = p1;
        this.p2 = p2;
      });

      this.vm2 = new InnerVm2();
    },
  });

  const InnerVm1 = Evented.EventedMixin(Accessor).createSubclass({
    declaredClass: "inner.viewModel.v1",

    properties: {
      p1: {},
      p2: {},
    },

    constructor() {
      this.p1 = 3;
      this.p2 = 4;
    },

    trigger() {
      this.emit("evt", {
        p1: this.p1,
        p2: this.p2,
      });
    },
  });

  const InnerVm2 = Accessor.createSubclass({
    declaredClass: "inner.viewModel.v2",

    properties: {
      running: {},
      p1: {},
      p2: {},
    },

    constructor() {
      this.running = true;

      this.handles = new Handles();

      this.init();
    },

    init() {
      this.handles.add([
        reactiveUtils.autorun(() => {
          console.log(this.running);
        }),
        reactiveUtils.autorun(() => {
          if (this.p1 > 0 && this.p2 > 0) {
            this.doSomething();
          }
        }),
      ]);
    },

    doSomething() {
      console.log("do it");
    },
  });

  const vm = new OuterVm();

  setTimeout(() => {
    vm.vm1.trigger();
  }, 1500);

  setTimeout(() => {
    vm.p1 = null;
    vm.p2 = null;

    vm.vm2.running = false;
  }, 3500)

  // const Obj = Accessor.createSubclass({
  //   declaredClass: "test.Obj",

  //   constructor() {
  //     this.name = "";
  //   },

  //   properties: {
  //     name: {},
  //   },
  // });

  // const o = new Obj();
  // trackingUtils.reactionInit(
  //   () => {
  //     return {
  //       name: o.name,
  //     };
  //   },
  //   ({ name }) => {
  //     console.log(name);
  //   }
  // );

  // watchUtils.watch(o, "name", (value) => {
  //   console.log(value);
  // });

  // o.name = "1";
});
