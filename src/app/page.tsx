"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, ReactNode } from "react";
import {
  Zap,
  ShieldCheck,
  Globe,
  MessageCircle,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Smartphone,
  LayoutDashboard, // <-- Ícone novo para a seção do admin
} from "lucide-react";
import { Button } from "@/components/ui/button";

// --- COMPONENTE DE ANIMAÇÃO DE SCROLL ---
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -80px 0px" },
    );

    if (domRef.current) observer.observe(domRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={domRef}
      className={`transition-all duration-700 ease-out ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const whatsappLink =
    "https://wa.me/5583999170411?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20como%20criar%20minha%20loja%20na%20Bewear.";

  return (
    <div className="flex min-h-screen flex-col overflow-hidden scroll-smooth bg-white text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-100 bg-white/80 px-6 backdrop-blur-lg transition-all sm:h-20 md:px-12">
        <Link
          href="/"
          className="flex items-center gap-3 transition-transform hover:opacity-80"
        >
          <Image
            src="/logo-bewear.png"
            alt="Logo Bewear"
            width={36}
            height={36}
            className="object-contain"
          />
          <span className="text-xl font-black tracking-tighter text-slate-900 sm:text-2xl">
            BEWEAR
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#vantagens" className="hover:text-primary transition-colors">
            Vantagens
          </a>
          <a href="#vitrine" className="hover:text-primary transition-colors">
            A Plataforma
          </a>
          <a
            href="#funcionalidades"
            className="hover:text-primary transition-colors"
          >
            Funcionalidades
          </a>
          <a href="#faq" className="hover:text-primary transition-colors">
            FAQ
          </a>
        </nav>

        <Button
          className="hidden rounded-full font-semibold shadow-md transition-transform hover:scale-105 sm:flex"
          asChild
        >
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            Fale com a gente
          </a>
        </Button>
      </header>

      <main className="flex-1">
        {/* HERO SECTION - Limpo, apenas texto e botão */}
        <section className="relative mx-auto max-w-6xl px-6 py-20 text-center md:py-32">
          {/* Background Blur */}
          <div className="bg-primary/20 absolute top-1/2 left-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"></div>

          <FadeIn className="space-y-8">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm">
              <Zap className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span>A plataforma feita para quem quer crescer</span>
            </div>

            <h1 className="text-5xl font-extrabold tracking-tight text-balance md:text-7xl">
              Venda online com sua própria marca.{" "}
              <br className="hidden md:block" />
              <span className="from-primary bg-gradient-to-r to-purple-500 bg-clip-text text-transparent">
                Sem complicação.
              </span>
            </h1>

            <p className="text-muted-foreground mx-auto max-w-2xl text-lg text-balance md:text-2xl">
              Esqueça as taxas absurdas dos marketplaces. Tenha sua loja virtual
              premium, com gestão de estoque e pagamentos automatizados.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
              <Button
                size="lg"
                className="group shadow-primary/25 hover:shadow-primary/40 relative gap-2 rounded-full px-8 py-6 text-lg font-bold shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
                asChild
              >
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-5 w-5" />
                  Criar minha loja agora
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
            </div>
          </FadeIn>
        </section>

        {/* VANTAGENS */}
        <section id="vantagens" className="bg-slate-900 py-24 text-slate-50">
          <div className="mx-auto max-w-6xl px-6">
            <FadeIn className="mb-16 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
                Por que escolher a Bewear?
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Tecnologia de ponta trabalhando para o seu bolso.
              </p>
            </FadeIn>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  title: "Foco na sua Marca",
                  desc: "Aqui a estrela é você. Sua logo, suas cores, seu link. Sem competir espaço com outros vendedores.",
                  icon: Globe,
                },
                {
                  title: "Zero Dor de Cabeça",
                  desc: "Nós somos desenvolvedores especialistas. Cuidamos de toda a infraestrutura chata para você focar apenas em vender.",
                  icon: TrendingUp,
                },
                {
                  title: "Checkout Transparente",
                  desc: "Receba via PIX ou Cartão sem o cliente sair da sua página. Aumento imediato na taxa de conversão final.",
                  icon: ShieldCheck,
                },
              ].map((item, i) => (
                <FadeIn key={i} delay={i * 150}>
                  <div className="group hover:border-primary/50 hover:shadow-primary/20 h-full rounded-3xl border border-slate-700 bg-slate-800/50 p-8 transition-all duration-300 hover:-translate-y-2 hover:bg-slate-800 hover:shadow-2xl">
                    <div className="text-primary group-hover:bg-primary/20 group-hover:border-primary/50 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 transition-all duration-300 group-hover:scale-110">
                      <item.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mb-3 text-2xl font-bold">{item.title}</h3>
                    <p className="leading-relaxed text-slate-400 group-hover:text-slate-300">
                      {item.desc}
                    </p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* SEÇÃO DUPLA - O ZIG-ZAG DA PLATAFORMA */}
        <div id="vitrine" className="flex flex-col">
          {/* PARTE 1: VITRINE SHOWCASE - iPHONES (Texto na Esquerda, Imagem na Direita) */}
          <section className="overflow-hidden bg-slate-50 py-24">
            <div className="mx-auto max-w-6xl px-6">
              <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                {/* Textos */}
                <FadeIn className="space-y-8">
                  <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
                    <Smartphone className="h-6 w-6" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
                    Uma vitrine que <br className="hidden lg:block" /> faz o
                    cliente babar.
                  </h2>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Seus clientes compram pelo celular. Por isso, desenvolvemos
                    uma experiência de loja virtual{" "}
                    <strong>100% otimizada para mobile</strong>. Navegação
                    rápida, visual limpo e fechamento de pedido em poucos
                    toques.
                  </p>
                  <ul className="space-y-4">
                    {[
                      "Design premium e moderno",
                      "Carregamento ultra-rápido",
                      "Busca e categorias inteligentes",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 font-medium text-slate-700"
                      >
                        <CheckCircle2 className="text-primary h-5 w-5" /> {item}
                      </li>
                    ))}
                  </ul>
                </FadeIn>

                {/* MOCKUPS iPHONES */}
                <div className="relative mx-auto h-[550px] w-full max-w-[400px] sm:h-[650px] lg:max-w-none">
                  <FadeIn
                    delay={200}
                    className="absolute top-10 right-0 w-[240px] sm:right-10 sm:w-[280px]"
                  >
                    <div className="relative overflow-hidden rounded-[2.5rem] border-[8px] border-slate-200 bg-slate-200 opacity-90 shadow-xl transition-transform hover:z-30 hover:-translate-y-2 hover:scale-105 hover:opacity-100">
                      <div className="absolute top-0 left-1/2 z-20 h-6 w-32 -translate-x-1/2 rounded-b-3xl bg-slate-200"></div>
                      <div className="relative aspect-[9/19] w-full overflow-hidden rounded-[2rem] bg-white">
                        <Image
                          src="/mobile-store-2.png"
                          alt="Vitrine Mobile Categorias"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                    </div>
                  </FadeIn>
                  <FadeIn
                    delay={400}
                    className="absolute top-0 left-0 z-20 w-[240px] sm:left-10 sm:w-[280px]"
                  >
                    <div className="relative overflow-hidden rounded-[2.5rem] border-[8px] border-slate-900 bg-slate-900 shadow-2xl ring-4 ring-slate-900/10 transition-transform hover:-translate-y-2 hover:scale-105">
                      <div className="absolute top-0 left-1/2 z-20 flex h-6 w-32 -translate-x-1/2 items-center justify-center gap-2 rounded-b-3xl bg-slate-900">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-700"></div>
                        <div className="h-1.5 w-8 rounded-full bg-slate-800"></div>
                      </div>
                      <div className="relative aspect-[9/19] w-full overflow-hidden rounded-[2rem] bg-white">
                        <Image
                          src="/mobile-store-1.png"
                          alt="Vitrine Mobile Principal"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                    </div>
                  </FadeIn>
                </div>
              </div>
            </div>
          </section>

          {/* PARTE 2: PAINEL ADMIN - MACBOOK (Imagem na Esquerda, Texto na Direita) */}
          <section className="overflow-hidden bg-white py-24">
            <div className="mx-auto max-w-6xl px-6">
              <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                {/* MOCKUP MACBOOK (Esquerda no PC, cima no Mobile) */}
                <div className="relative order-2 mx-auto w-full max-w-[600px] lg:order-1 lg:max-w-none">
                  <FadeIn delay={200}>
                    <div className="relative z-10 overflow-hidden rounded-t-2xl border-4 border-b-0 border-slate-800 bg-slate-900 p-2 shadow-2xl transition-transform hover:-translate-y-2 hover:scale-[1.02] md:rounded-t-[1.5rem]">
                      <div className="absolute top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-600"></div>
                      {/* ✅ aspect-video garante que o print não seja cortado */}
                      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100">
                        <Image
                          src="/admin-dashboard.png"
                          alt="Painel de Controle Bewear"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                    </div>
                    <div className="relative z-20 -ml-[2.5%] flex h-4 w-[105%] justify-center rounded-b-xl bg-slate-300 shadow-xl md:h-5">
                      <div className="h-1 w-1/5 rounded-b-lg bg-slate-400"></div>
                    </div>
                  </FadeIn>
                </div>

                {/* Textos (Direita no PC) */}
                <FadeIn className="order-1 space-y-8 lg:order-2">
                  <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
                    <LayoutDashboard className="h-6 w-6" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
                    O controle total <br className="hidden lg:block" /> do seu
                    negócio.
                  </h2>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Acompanhe suas vendas, gerencie o estoque e crie promoções
                    em um{" "}
                    <strong>
                      painel de controle inteligente e fácil de usar
                    </strong>
                    . Feito para você focar na estratégia, sem se perder em
                    menus complicados.
                  </p>
                  <ul className="space-y-4">
                    {[
                      "Dashboard com métricas claras",
                      "Gestão fácil de variações e preços",
                      "Alertas automáticos de baixo estoque",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 font-medium text-slate-700"
                      >
                        <CheckCircle2 className="text-primary h-5 w-5" /> {item}
                      </li>
                    ))}
                  </ul>
                </FadeIn>
              </div>
            </div>
          </section>
        </div>

        {/* FUNCIONALIDADES (O resto da página continua igual...) */}
        <section id="funcionalidades" className="bg-slate-50 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <FadeIn className="mb-16 md:w-2/3">
              <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
                Tudo que você precisa em um só lugar.
              </h2>
            </FadeIn>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                {
                  title: "Gestão de Estoque em Tempo Real",
                  desc: "O cliente pagou no PIX? O sistema dá baixa no estoque automaticamente. Chega de vender o que não tem.",
                },
                {
                  title: "Variações de Produtos",
                  desc: "Cadastre cores, tamanhos e fotos diferentes para cada variação do seu produto de forma intuitiva.",
                },
                {
                  title: "Gatilhos de Promoção (De/Por)",
                  desc: "Crie ofertas com preço riscado facilmente pelo painel para aumentar a urgência e as vendas.",
                },
                {
                  title: "Painel Mobile First",
                  desc: "Gerencie sua loja, atualize produtos e acompanhe pedidos diretamente pelo seu celular, de onde estiver.",
                },
              ].map((feature, i) => (
                <FadeIn key={i} delay={i * 100}>
                  <div className="hover:border-primary/30 group flex gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <div className="mt-1 flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{feature.title}</h3>
                      <p className="text-muted-foreground mt-2">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section id="como-funciona" className="bg-white px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <FadeIn className="mb-16 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Como funciona na prática?
              </h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Esqueça os tutoriais complexos. Nós fazemos o trabalho duro.
              </p>
            </FadeIn>

            <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
              <div className="absolute top-10 right-[16%] left-[16%] hidden h-[2px] bg-slate-100 md:block"></div>

              {[
                {
                  step: "1",
                  title: "Alinhamento",
                  desc: "Você nos chama no WhatsApp e conta sobre o seu negócio e suas cores.",
                },
                {
                  step: "2",
                  title: "Setup Mágico",
                  desc: "Nós configuramos seu subdomínio, painel de gestão e meios de pagamento.",
                },
                {
                  step: "3",
                  title: "Pronto para Vender",
                  desc: "Você recebe seus acessos, cadastra os produtos e já pode divulgar o link!",
                },
              ].map((item, i) => (
                <FadeIn key={i} delay={i * 200}>
                  <div className="group relative space-y-6 text-center">
                    <div className="bg-primary group-hover:shadow-primary/50 relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl font-black text-white shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="mb-3 text-2xl font-bold">{item.title}</h3>
                      <p className="text-muted-foreground px-4 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-slate-50 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <FadeIn className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Dúvidas Frequentes
              </h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Tudo o que você precisa saber antes de dar o próximo passo.
              </p>
            </FadeIn>

            <div className="space-y-4">
              {[
                {
                  q: "Preciso saber programar para ter minha loja?",
                  a: "Não! Nós cuidamos de toda a parte técnica, servidores e atualizações. Você só precisará cadastrar seus produtos e começar a vender usando nosso painel super simples.",
                },
                {
                  q: "Quais são as taxas por venda?",
                  a: "A Bewear não cobra comissões abusivas por venda como os marketplaces. Você paga apenas a taxa padrão do gateway de pagamento (PIX ou Cartão) que escolhermos configurar para você.",
                },
                {
                  q: "Posso usar meu próprio domínio?",
                  a: "Com certeza! Se você já possui um domínio (ex: www.sualoja.com.br), nós fazemos toda a configuração de DNS para você sem custo adicional.",
                },
                {
                  q: "Quanto tempo demora para a loja ficar pronta?",
                  a: "Após o alinhamento inicial e envio da sua logo, sua estrutura estará no ar e pronta para você adicionar os produtos em poucos dias úteis.",
                },
              ].map((faq, i) => (
                <FadeIn key={i} delay={i * 100}>
                  <details className="group hover:border-primary/30 cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-center justify-between text-lg font-semibold text-slate-800 focus:outline-none">
                      {faq.q}
                      <span className="ml-4 flex-shrink-0 transition-transform duration-300 group-open:-rotate-180">
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                      </span>
                    </summary>
                    <p className="animate-in fade-in slide-in-from-top-2 mt-4 leading-relaxed text-slate-600 duration-300">
                      {faq.a}
                    </p>
                  </details>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="bg-white px-6 py-24">
          <FadeIn>
            <div className="bg-primary relative mx-auto max-w-5xl overflow-hidden rounded-[3rem] px-6 py-24 text-center text-white shadow-2xl">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-black/10 blur-3xl"></div>

              <div className="relative z-10 mx-auto max-w-3xl space-y-8">
                <h2 className="text-4xl font-black tracking-tight md:text-5xl">
                  Pronto para profissionalizar suas vendas?
                </h2>
                <p className="text-primary-foreground/90 text-xl">
                  Nós configuramos a estrutura, você foca no que faz de melhor:
                  vender.
                </p>
                <Button
                  variant="secondary"
                  size="lg"
                  className="group text-primary mt-4 gap-2 rounded-full px-10 py-7 text-lg font-bold shadow-xl transition-all hover:scale-105 hover:bg-white"
                  asChild
                >
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-6 w-6" />
                    Quero minha loja na Bewear
                  </a>
                </Button>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white pt-16 pb-8">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
            <div className="space-y-4 md:col-span-2">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo-bewear.png"
                  alt="Logo Bewear"
                  width={32}
                  height={32}
                  className="object-contain opacity-80 grayscale"
                />
                <span className="text-xl font-black tracking-tighter text-slate-800">
                  BEWEAR
                </span>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-slate-500">
                A plataforma completa para criar sua vitrine digital. Focada em
                performance, conversão e no fortalecimento da sua marca.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-slate-900">Departamentos</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>
                  <a
                    href="#vantagens"
                    className="hover:text-primary transition-colors"
                  >
                    Por que a Bewear?
                  </a>
                </li>
                <li>
                  <a
                    href="#vitrine"
                    className="hover:text-primary transition-colors"
                  >
                    A Plataforma
                  </a>
                </li>
                <li>
                  <a
                    href="#funcionalidades"
                    className="hover:text-primary transition-colors"
                  >
                    Funcionalidades
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="hover:text-primary transition-colors"
                  >
                    Perguntas Frequentes
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-slate-900">Fale Conosco</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary flex items-center gap-2 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" /> (83) 99917-0411
                  </a>
                </li>
                <li>contato@bewear.com.br</li>
              </ul>
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 text-xs text-slate-500 md:flex-row">
            <p>
              © {new Date().getFullYear()} BEWEAR. Todos os direitos
              reservados.
            </p>
            <div className="flex gap-4">
              <Link href="/termos" className="hover:text-primary">
                Termos de Uso
              </Link>
              <Link href="/privacidade" className="hover:text-primary">
                Política de Privacidade
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
