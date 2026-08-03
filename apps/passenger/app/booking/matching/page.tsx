"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MockMap } from "../../../components/mock-map";

export default function MatchingPage() {
  const router = useRouter();

  React.useEffect(() => {
    // TODO: replace with Socket.IO subscription to ride status ->
    // navigate once status transitions MATCHED -> ACCEPTED
    const t = setTimeout(() => router.push("/ride/demo-ride-id"), 2800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <MockMap variant="searching" className="h-64" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-8 flex flex-1 flex-col items-center justify-center text-center"
      >
        <p className="font-display text-lg font-medium text-ink">Finding your driver…</p>
        <p className="mt-1 text-sm text-ink-soft">This usually takes a few seconds.</p>
      </motion.div>
    </main>
  );
}
