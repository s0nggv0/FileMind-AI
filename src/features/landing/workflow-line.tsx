"use client";

import { motion } from "framer-motion";
import { useMotionPreference } from "@/hooks/use-motion-preference";

export function WorkflowLine() {
  const reducedMotion = useMotionPreference();
  return <motion.div aria-hidden="true" className="absolute bottom-7 left-[18px] top-3 w-px origin-top bg-border md:bottom-auto md:left-5 md:right-[18%] md:top-[18px] md:h-px md:w-auto md:origin-left" initial={{ opacity: 1, scale: reducedMotion ? 1 : 0.85 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: reducedMotion ? 0 : 0.5 }} />;
}
