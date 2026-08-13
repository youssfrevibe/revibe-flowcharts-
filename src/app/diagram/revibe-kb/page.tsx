"use client";

import FlowCanvas from "@/components/FlowCanvas";
import { getKBNodes, getKBConnections } from "@/lib/kb-data";

export default function RevibeKBPage() {
  return (
    <FlowCanvas
      title="Revibe KB"
      subtitle="Knowledge base and claims resolution process"
      initialNodes={getKBNodes()}
      initialConnections={getKBConnections()}
      storageKey="revibe-kb"
    />
  );
}
