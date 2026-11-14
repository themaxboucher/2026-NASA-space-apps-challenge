// Phones and tablets get "drag to circle around it" instead of keyboard walking.
export const coarsePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
