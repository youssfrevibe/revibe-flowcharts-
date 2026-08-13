import { FlowNode, FlowConnection } from "./types";

let _nid = 0;
function nid(): string {
  return "n" + ++_nid;
}

export function getInitialNodes(): FlowNode[] {
  _nid = 0;
  return [
    { id: nid(), type: "start", x: 500, y: 30, label: "Customer Starts Shopping", detail: "Visits Revibe store (Saudi Arabia, UAE, South Africa, or Philippines)" },
    { id: nid(), type: "step", x: 460, y: 140, label: "Browses & Selects Product", detail: "Customer views refurbished phones, tablets, or accessories and picks a product" },
    { id: nid(), type: "step", x: 460, y: 260, label: "Adds to Cart", detail: "Customer selects model, storage, color, and condition then adds to cart" },
    { id: nid(), type: "step", x: 460, y: 380, label: "Proceeds to Checkout", detail: "Enters shipping address, selects payment method, and applies any discount code" },
    { id: nid(), type: "decision", x: 460, y: 510, label: "How is the customer paying?", detail: "Payment method determines the next verification steps" },
    { id: nid(), type: "sub", x: 80, y: 510, label: "COD: Verify by Phone", detail: "Agent calls customer to confirm the Cash on Delivery order is genuine" },
    { id: nid(), type: "decision", x: 80, y: 650, label: "Customer confirms?", detail: "Does the customer pick up and confirm they placed this order?" },
    { id: nid(), type: "fail", x: -50, y: 790, label: "Order Cancelled", detail: "Customer did not confirm — order is automatically cancelled" },
    { id: nid(), type: "sub", x: 860, y: 510, label: "Installment: ID Verification", detail: "Customer submits national ID for Tamara / Tabby / Revibe installment verification" },
    { id: nid(), type: "step", x: 460, y: 690, label: "Operations Assigns a Supplier", detail: "The Revibe operations team identifies the best supplier for this product" },
    { id: nid(), type: "decision", x: 460, y: 820, label: "Is the product available?", detail: "Supplier confirms they have the exact model, color, and condition in stock" },
    { id: nid(), type: "decision", x: 860, y: 820, label: "Can an alternative be offered?", detail: "Operations checks if another supplier or similar product is available" },
    { id: nid(), type: "fail", x: 860, y: 960, label: "Order Cancelled", detail: "No suitable product found — customer is refunded" },
    { id: nid(), type: "step", x: 1100, y: 710, label: "Offer Alternative to Customer", detail: "Customer is contacted with a replacement option (different color, storage, or supplier)" },
    { id: nid(), type: "step", x: 460, y: 960, label: "Supplier Confirms the Order", detail: "Supplier locks in the device — confirmed date is recorded" },
    { id: nid(), type: "step", x: 460, y: 1080, label: "Device Undergoes Quality Check", detail: "QC team inspects: screen, battery health, buttons, cameras, and IMEI verification" },
    { id: nid(), type: "decision", x: 120, y: 1080, label: "Installment order?", detail: "Does this order require a device lock for payment protection?" },
    { id: nid(), type: "sub", x: 120, y: 1220, label: "Install Device Lock", detail: "Anti-theft lock is installed on the device to protect installment payments" },
    { id: nid(), type: "step", x: 460, y: 1220, label: "Courier Picks Up the Device", detail: "Shipment created with courier (Aramex, DHL, SMSA, Naqel, UPS, or others)" },
    { id: nid(), type: "step", x: 460, y: 1340, label: "Device In Transit to Customer", detail: "Tracking number is shared — customer can follow their delivery live" },
    { id: nid(), type: "decision", x: 460, y: 1470, label: "Does the customer accept delivery?", detail: "Courier delivers the package to the customer's address" },
    { id: nid(), type: "ok", x: 410, y: 1610, label: "Order Delivered Successfully", detail: "Customer receives their device — delivery date is recorded" },
    { id: nid(), type: "fail", x: 770, y: 1470, label: "Customer Refused Delivery", detail: "Device is returned to sender — a claim process may follow" },
    { id: nid(), type: "step", x: 120, y: 1610, label: "Payment Settled with Supplier", detail: "Finance team processes supplier payment — tracked as Paid, Waived, or Backlog" },
  ];
}

export function getInitialConnections(): FlowConnection[] {
  return [
    { from: "n1", to: "n2", label: "", type: "" },
    { from: "n2", to: "n3", label: "", type: "" },
    { from: "n3", to: "n4", label: "", type: "" },
    { from: "n4", to: "n5", label: "", type: "" },
    { from: "n5", to: "n6", label: "Cash on Delivery", type: "camber" },
    { from: "n5", to: "n9", label: "Installments", type: "camber" },
    { from: "n5", to: "n10", label: "Card / Apple Pay / Prepaid", type: "cyes" },
    { from: "n6", to: "n7", label: "", type: "" },
    { from: "n7", to: "n8", label: "No", type: "cno" },
    { from: "n7", to: "n10", label: "Yes", type: "cyes" },
    { from: "n9", to: "n10", label: "Verified", type: "cyes" },
    { from: "n10", to: "n11", label: "", type: "" },
    { from: "n11", to: "n12", label: "Not available", type: "cno" },
    { from: "n11", to: "n15", label: "Available", type: "cyes" },
    { from: "n12", to: "n13", label: "No alternative", type: "cno" },
    { from: "n12", to: "n14", label: "Yes", type: "cyes" },
    { from: "n14", to: "n10", label: "Customer accepts", type: "camber" },
    { from: "n15", to: "n16", label: "", type: "" },
    { from: "n16", to: "n17", label: "", type: "" },
    { from: "n17", to: "n18", label: "Yes", type: "camber" },
    { from: "n18", to: "n19", label: "", type: "" },
    { from: "n16", to: "n19", label: "", type: "" },
    { from: "n19", to: "n20", label: "", type: "" },
    { from: "n20", to: "n21", label: "", type: "" },
    { from: "n21", to: "n22", label: "Accepted", type: "cyes" },
    { from: "n21", to: "n23", label: "Refused", type: "cno" },
    { from: "n22", to: "n24", label: "", type: "" },
  ];
}
