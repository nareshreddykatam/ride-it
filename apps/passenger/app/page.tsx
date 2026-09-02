"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function SplashPage() {
  const router = useRouter();

  React.useEffect(() => {
    const t = setTimeout(() => router.replace("/login"), 1400);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-ink-blue px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        <motion.div
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              stroke="white"
              strokeWidth="3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            />
            <path d="M20 34 L28 42 L44 24" stroke="var(--marigold)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-4 font-display text-2xl font-medium text-white"
        >
          Ridora
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-1 text-sm text-white/70"
        >
          Your ride. Your way.
        </motion.p>
      </motion.div>
    </main>
  );
}
