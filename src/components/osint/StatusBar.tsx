import { Activity, Radio, ShieldCheck, Cpu } from "lucide-react";
import { useState, useEffect } from "react";

export function StatusBar() {
  const [now, setNow] = useState<string[]>(["", ""]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const time = d.toLocaleTimeString("id-ID", { hour12: false });
      const date = d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
      setNow([date, time]);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const date = now[0];
  const time = now[1];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 border-b border-border bg-panel/60 backdrop-blur text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
        <span className="text-success">SECURE LINK</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Activity className="w-3.5 h-3.5 text-cyber" /> NODE: SBY-01
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Radio className="w-3.5 h-3.5 text-cyber" /> UPLINK 980Mb/s
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Cpu className="w-3.5 h-3.5 text-cyber" /> LOAD 24%
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5 text-cyber" /> CLR: TS//SCI
      </div>
      <div className="ml-auto flex items-center gap-3 text-muted-foreground">
        <span>{date}</span>
        <span className="text-cyber text-glow">{time}</span>
      </div>
    </div>
  );
}
