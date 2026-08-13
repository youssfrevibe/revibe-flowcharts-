"use client";

import FlowCanvas from "@/components/FlowCanvas";
import { getInitialNodes, getInitialConnections } from "@/lib/initial-data";

export default function OrderToDeliveryPage() {
  return (
    <FlowCanvas
      title="Order-to-Delivery Process"
      subtitle="Customer journey from checkout to doorstep"
      initialNodes={getInitialNodes()}
      initialConnections={getInitialConnections()}
      storageKey="order-to-delivery"
    />
  );
}
