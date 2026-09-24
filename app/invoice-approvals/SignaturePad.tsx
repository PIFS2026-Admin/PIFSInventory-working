"use client";

import { useEffect, useRef } from "react";
import { Eraser } from "lucide-react";
import styles from "./invoice-approvals.module.css";

type SignaturePadProps = {
  onChange: (dataUrl: string) => void;
};

export default function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const prepareCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 5;
    context.strokeStyle = "#111827";
    return { canvas, context };
  };

  const clear = () => {
    const prepared = prepareCanvas();
    if (!prepared) return;
    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    prepared.context.fillStyle = "#ffffff";
    prepared.context.fillRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    hasInk.current = false;
    onChange("");
  };

  useEffect(() => { clear(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const prepared = prepareCanvas();
    if (!prepared) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    prepared.context.beginPath();
    prepared.context.moveTo(next.x, next.y);
    drawing.current = true;
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const prepared = prepareCanvas();
    if (!prepared) return;
    const next = point(event);
    prepared.context.lineTo(next.x, next.y);
    prepared.context.stroke();
    hasInk.current = true;
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = canvasRef.current;
    onChange(canvas && hasInk.current ? canvas.toDataURL("image/png") : "");
  };

  return <div className={styles.signaturePad}>
    <div className={styles.signaturePadHeading}><span>DRAWN SIGNATURE</span><button type="button" onClick={clear}><Eraser size={15} /> Clear</button></div>
    <canvas ref={canvasRef} width={900} height={270} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Drawn signature area" />
  </div>;
}
