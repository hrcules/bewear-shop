"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { AdminNav } from "./admin-nav";

interface MobileSidebarProps {
  storeName: string;
  colorPrimary: string;
}

export function MobileSidebar({ storeName, colorPrimary }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[280px]"
        style={
          {
            "--primary": colorPrimary,
            "--ring": colorPrimary,
          } as React.CSSProperties
        }
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-primary text-xl font-bold">
            <p className="text-accent-foreground text-sm font-semibold">
              área restrita
            </p>
            {storeName}
          </SheetTitle>
        </SheetHeader>

        <AdminNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
