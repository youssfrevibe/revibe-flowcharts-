import { FlowNode, FlowConnection } from "./types";

let _nid = 100;
function nid(): string {
  return "n" + ++_nid;
}

export function getKBNodes(): FlowNode[] {
  _nid = 100;
  return [
    { id: nid(), type: "start", x: 500, y: 50, label: "Start", detail: "Double-click to edit" },
    { id: nid(), type: "step", x: 500, y: 180, label: "New Step", detail: "Double-click to edit" },
    { id: nid(), type: "decision", x: 500, y: 320, label: "Decision?", detail: "Double-click to edit" },
    { id: nid(), type: "ok", x: 500, y: 470, label: "Done", detail: "Double-click to edit" },
  ];
}

export function getKBConnections(): FlowConnection[] {
  return [
    { from: "n101", to: "n102", label: "", type: "" },
    { from: "n102", to: "n103", label: "", type: "" },
    { from: "n103", to: "n104", label: "Yes", type: "cyes" },
  ];
}
