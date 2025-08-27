"use client";

import { useEffect, useRef, useState } from "react";

type QrScannerProps = {
  open: boolean;
  onDetected: (value: string) => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export default function QrScanner({ open, onDetected, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    let active = true;

    (async () => {
      try {
        setErr(null);
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) return;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
          loopDetect();
        }
      } catch (e: any) {
        setErr(e?.message ?? "Kamera açılamadı.");
      }
    })();

    return () => {
      active = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function toggleTorch() {
    try {
      const track = stream?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities?.();
      if (!track || !caps || !(caps as any).torch) return;
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] as any });
      setTorchOn((t) => !t);
    } catch {
      // sessizce yoksay
    }
  }

  function stopAll() {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setTorchOn(false);
  }

  async function detectWithBarcodeDetector(v: HTMLVideoElement): Promise<string | null> {
    if (!("BarcodeDetector" in window)) return null;
    try {
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await det.detect(v);
      if (Array.isArray(codes) && codes.length > 0) {
        const raw = codes[0]?.rawValue || codes[0]?.rawData;
        return typeof raw === "string" ? raw : null;
      }
    } catch {
      // tarayıcı desteklemiyorsa sessiz geç
    }
    return null;
  }

  function loopDetect() {
    if (!videoRef.current || !canvasRef.current) return;
    if (stoppedRef.current) return;

    const v = videoRef.current;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 360;
    ctx.drawImage(v, 0, 0, c.width, c.height);

    detectWithBarcodeDetector(v).then((text) => {
      if (text && !stoppedRef.current) {
        stoppedRef.current = true;
        onDetected(String(text).trim());
        stopAll();
      } else {
        rafRef.current = requestAnimationFrame(loopDetect);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-white font-semibold">QR Kodunu Okut</h3>
          <div className="space-x-2">
            <button
              type="button"
              onClick={toggleTorch}
              className="px-3 py-1.5 rounded bg-slate-700 text-white"
            >
              {torchOn ? "Fener Kapat" : "Fener Aç"}
            </button>
            <button
              type="button"
              onClick={() => {
                stopAll();
                onClose?.();
              }}
              className="px-3 py-1.5 rounded bg-slate-700 text-white"
            >
              Kapat
            </button>
          </div>
        </div>

        <div className="p-4">
          {err ? (
            <div className="text-red-400 text-sm">{err}</div>
          ) : (
            <>
              <div className="relative rounded-lg overflow-hidden border border-cyan-500">
                <video ref={videoRef} className="w-full h-auto" playsInline muted />
                {/* hedefleme çerçevesi */}
                <div className="pointer-events-none absolute inset-0 border-2 border-cyan-400 rounded-lg m-8" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <p className="text-slate-300 text-sm mt-3">
                Kamerayı QR koda yöneltin. Kod algılanınca otomatik devam eder.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
