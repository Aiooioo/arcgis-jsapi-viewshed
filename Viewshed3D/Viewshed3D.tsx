// esri.core
import { ignoreAbortErrors } from "esri/core/promiseUtils";

// esri.core.accessorSupport
import {
  aliasOf,
  property,
  subclass,
} from "esri/core/accessorSupport/decorators";

// esri.views
import { ISceneView } from "esri/views/ISceneView";

// esri.views.3d.layers
// import "../views/3d/layers/LineOfSightLayerView3D";

// esri.widgets
import Widget from "esri/widgets/Widget";

// esri.widgets.LineOfSight
import Viewshed3DViewModel from "./Viewshed3DViewModel";

// esri.widgets.support
import { VNode } from "esri/widgets/support/interfaces";
import {
  accessibleHandler,
  messageBundle,
  tsx,
} from "esri/widgets/support/widget";

const CSS = {
  // common
  button: "esri-button esri-button--secondary",
  buttonDisabled: "esri-button--disabled",
  widgetIcon: "esri-icon-line-of-sight",
  // base
  base: "esri-line-of-sight esri-widget esri-widget--panel",
  // container
  container: "esri-line-of-sight__container",
  actionSection: "esri-line-of-sight__actions",
  // hint
  hint: "esri-line-of-sight__hint",
  hintText: "esri-line-of-sight__hint-text",
  panelError: "esri-line-of-sight__panel--error",
  // clear
  newAnalysisButton: "esri-line-of-sight__new-analysis-button",
  secondaryButton: "esri-line-of-sight__secondary-button",
};

@subclass("geoscene.ext.widgets.Viewshed3D")
class Viewshed3D extends Widget {
  constructor(properties?: any, parentNode?: string | Element) {
    super(properties, parentNode);
  }

  @property()
  override iconClass = CSS.widgetIcon;

  @aliasOf("viewModel.view")
  view: ISceneView = null;

  @aliasOf("viewModel.visible")
  override visible: boolean;

  @aliasOf("viewModel.active")
  active: boolean;

  @property({
    type: Viewshed3DViewModel,
  })
  override viewModel = new Viewshed3DViewModel();

  override render(): VNode {
    return (
      <div class={CSS.base} role="presentation">
        {this.renderContainerNode()}
      </div>
    );
  }

  renderContainerNode(): VNode {
    if (!this.visible) {
      return null;
    }

    if (!this.viewModel.supported) {
      return this.renderUnsupportedMessage();
    }

    let hintNode: VNode = null;
    const actionNodes: VNode[] = [this.renderNewAnalysisButton()];

    if (this.viewModel.state === "creating") {
      hintNode = this.renderHint();
      actionNodes.unshift(this.renderDoneButton());
    } else if (
      this.viewModel.state === "created" &&
      this.viewModel.targets.length > 0
    ) {
      actionNodes.unshift(this.renderContinueButton());
    }

    return (
      <div class={CSS.container}>
        {hintNode}
        <div class={CSS.actionSection}>{actionNodes}</div>
      </div>
    );
  }

  //--------------------------------------------------------------------------
  //
  //  Private Methods
  //
  //--------------------------------------------------------------------------
  private renderUnsupportedMessage(): VNode {
    return (
      <div class={CSS.panelError} key="esri-line-of-sight__unsupported">
        <p>{this.messages.unsupported}</p>
      </div>
    );
  }

  private renderHint(): VNode {
    return (
      <div class={CSS.hint} key="esri-line-of-sight__hint">
        <p class={CSS.hintText}>{this.messages.hint}</p>
      </div>
    );
  }

  private renderNewAnalysisButton(): VNode {
    return this.renderButton(
      this.onNewAnalysis,
      this.messages.newAnalysis,
      CSS.newAnalysisButton,
      "esri-line-of-sight__new-button"
    );
  }

  private renderDoneButton(): VNode {
    return this.renderButton(
      this.onDone,
      this.messages.done,
      CSS.secondaryButton,
      "esri-line-of-sight__done-button"
    );
  }

  private renderContinueButton(): VNode {
    return this.renderButton(
      this.onContinue,
      this.messages.continueAnalysis,
      CSS.secondaryButton,
      "esri-line-of-sight__continue-button"
    );
  }

  private renderButton(
    onClick: () => void,
    label: string,
    cssClass: string,
    key: string
  ): VNode {
    const isDisabled = this.viewModel.state === "disabled";

    return (
      <button
        disabled={isDisabled}
        class={this.classes(
          cssClass,
          CSS.button,
          isDisabled && CSS.buttonDisabled
        )}
        bind={this}
        onclick={onClick}
        key={key}
        type="button"
      >
        {label}
      </button>
    );
  }

  @accessibleHandler()
  private onNewAnalysis(): void {
    this.viewModel.clear();
    ignoreAbortErrors(this.viewModel.start());
  }

  @accessibleHandler()
  private onDone(): void {
    this.viewModel.stop();
  }

  @accessibleHandler()
  private onContinue(): void {
    this.viewModel.continue();
  }
}

export default Viewshed3D;
