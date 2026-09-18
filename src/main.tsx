import React from "react";
import { createRoot } from "react-dom/client";
import { AuthRoot } from "./auth/AuthRoot";
createRoot(document.getElementById("root")!).render(<AuthRoot />);
