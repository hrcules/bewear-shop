"use client";

import {
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  House,
  Truck,
  ShoppingBag,
  User,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
// ✅ NOVO: Importações necessárias para navegação inteligente
import { useParams, usePathname, useRouter } from "next/navigation";

import type { categoryTable, storeTable } from "@/db/schema";
import { authClient } from "@/lib/auth-client";

import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { Separator } from "../../ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import Cart from "../cart";

interface HeaderClientProps {
  categories: (typeof categoryTable.$inferSelect)[];
  store: typeof storeTable.$inferSelect;
  session: {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
  } | null;
}

const HeaderClient = ({ categories, store, session }: HeaderClientProps) => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;

  const basePath =
    storeSlug && pathname.startsWith(`/store/${storeSlug}`)
      ? `/store/${storeSlug}`
      : "";

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    const parts = name.split(" ");
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    return (first + second).toUpperCase();
  };

  const handleSignInWithGoogle = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push(`${basePath}/`);
    router.refresh();
  };

  const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <header className="w-full bg-white">
      {/* ======================= HEADER MOBILE ======================= */}
      <div className="flex items-center justify-between p-5 md:hidden">
        <Link href={`${basePath}/`}>
          {store.logoUrl ? (
            <Image
              src={store.logoUrl}
              alt={store.name}
              width={100}
              height={26}
              className="max-h-[26px] object-contain"
            />
          ) : (
            <span className="text-primary text-xl font-bold tracking-tight">
              {store.name}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3">
          <Cart />
          <p className="text-accent-foreground">|</p>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-accent-foreground cursor-pointer"
              >
                <MenuIcon size={24} />
              </Button>
            </SheetTrigger>
            <SheetContent className="rounded-l-[24px] px-1">
              <SheetHeader>
                <SheetTitle className="text-lg font-semibold">Menu</SheetTitle>
              </SheetHeader>
              <div className="px-5">
                {session?.user ? (
                  <div className="flex justify-between space-y-6">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={session?.user.image ?? undefined} />
                        <AvatarFallback>
                          {getInitials(session?.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold">{session?.user?.name}</h3>
                        <span className="text-muted-foreground block text-xs">
                          {session?.user?.email}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 mb-6 flex flex-col items-start gap-3">
                    <h2 className="font-semibold">Olá, faça seu login!</h2>

                    <Button
                      variant="outline"
                      className="w-full cursor-pointer justify-center rounded-full"
                      onClick={handleSignInWithGoogle}
                    >
                      <GoogleIcon />
                      Entrar com Google
                    </Button>
                  </div>
                )}

                <Separator className="mt-6" />

                <div className="mt-4 flex flex-col items-start justify-start">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href={`${basePath}/`}>
                      <House className="mr-2 h-5 w-5" />
                      Inicio
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href={`${basePath}/orders`}>
                      <Truck className="mr-2 h-5 w-5" />
                      Meus Pedidos
                    </Link>
                  </Button>
                </div>

                <Separator className="mt-5" />

                <div className="mt-4 flex flex-col items-start justify-start">
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      variant="ghost"
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10 w-full justify-start transition-colors"
                      asChild
                    >
                      <Link href={`${basePath}/category/${category.slug}`}>
                        {category.name}
                      </Link>
                    </Button>
                  ))}
                </div>

                <Separator className="my-5" />
                {session?.user && (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground w-full cursor-pointer justify-start"
                    onClick={handleSignOut}
                  >
                    <LogOutIcon className="mr-2 h-5 w-5" />
                    Sair da Conta
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ======================= HEADER DESKTOP ======================= */}
      <div className="mx-auto hidden max-w-7xl flex-col gap-6 px-10 py-6 md:flex">
        <div className="flex w-full items-center justify-between">
          <div className="flex min-w-min flex-1 items-center justify-start gap-5">
            {session?.user ? (
              /* DROPDOWN DESKTOP LOGADO */
              <DropdownMenu>
                <DropdownMenuTrigger className="text-foreground flex cursor-pointer items-center gap-2 text-sm font-semibold transition-opacity outline-none hover:opacity-80">
                  <Avatar>
                    <AvatarImage src={session?.user.image ?? undefined} />
                    <AvatarFallback>
                      {getInitials(session?.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span>Olá, {session.user.name?.split(" ")[0]}!</span>
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="mt-2 w-[220px]">
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer p-3 font-medium"
                  >
                    <Link
                      href={`${basePath}/orders`}
                      className="flex w-full items-center"
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Meus Pedidos
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    className="cursor-pointer p-3 font-medium text-red-600 focus:bg-red-50 focus:text-red-600"
                    onClick={handleSignOut}
                  >
                    <LogOutIcon className="mr-2 h-4 w-4" />
                    Sair da Conta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* DROPDOWN DESKTOP DESLOGADO */
              <DropdownMenu>
                <DropdownMenuTrigger className="text-foreground flex cursor-pointer items-center gap-2 text-sm font-semibold outline-none hover:underline">
                  <User size={20} />
                  <span>Olá, faça seu login!</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="mt-2 w-[220px]">
                  <DropdownMenuItem
                    className="cursor-pointer p-3 font-medium"
                    onClick={handleSignInWithGoogle}
                  >
                    <GoogleIcon />
                    Entrar com Google
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex flex-1 items-center justify-center">
            <Link href={`${basePath}/`}>
              {store.logoUrl ? (
                <Image
                  src={store.logoUrl}
                  alt={store.name}
                  width={120}
                  height={26}
                  className="h-auto object-contain"
                />
              ) : (
                <span className="text-primary text-2xl font-bold tracking-tight">
                  {store.name}
                </span>
              )}
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-end gap-5">
            <div className="bg-border h-5 w-px"></div> <Cart />
          </div>
        </div>

        <nav className="flex items-center justify-center gap-8">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`${basePath}/category/${category.slug}`}
              className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
            >
              {category.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default HeaderClient;
