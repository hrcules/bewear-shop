"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const adminNavLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Produtos" },
  { href: "/admin/categories", label: "Categorias" },
  { href: "/admin/orders", label: "Pedidos" },
  { href: "/admin/settings", label: "Configurações" },
];

function isActiveLink(pathname: string, href: string) {
  // Dashboard só fica ativo na rota exata; os demais também nas sub-rotas
  if (href === "/admin") {
    return pathname === "/admin" || pathname === "/admin/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AdminNavProps {
  className?: string;
  onNavigate?: () => void;
}

export function AdminNav({ className, onNavigate }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-2", className)}>
      {adminNavLinks.map((link) => {
        const isActive = isActiveLink(pathname, link.href);

        return (
          <Button
            key={link.href}
            variant="ghost"
            className={cn(
              "w-full justify-start",
              isActive
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-primary",
            )}
            asChild
            onClick={onNavigate}
          >
            <Link
              href={link.href}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
