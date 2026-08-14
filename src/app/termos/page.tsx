import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-100 bg-white p-8 shadow-sm md:p-12">
        <Button variant="ghost" asChild className="mb-8 -ml-4 text-slate-500">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o início
          </Link>
        </Button>

        <h1 className="mb-4 text-3xl font-black text-slate-900">
          Termos e Condições de Uso
        </h1>
        <p className="mb-8 text-slate-500">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="space-y-8 leading-relaxed text-slate-700">
          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              1. Aceitação e Definições
            </h2>
            <p>
              Ao acessar e utilizar a plataforma <strong>Bewear</strong>,
              doravante denominada {"Plataforma"}, você (doravante {"Lojista"})
              concorda integralmente com estes Termos de Uso. A Plataforma
              fornece infraestrutura tecnológica (SaaS) para a criação e gestão
              de lojas virtuais.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              2. Responsabilidades do Lojista
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                O Lojista é única e exclusivamente responsável por todos os
                produtos, serviços, imagens e informações cadastradas em sua
                vitrine digital.
              </li>
              <li>
                A Bewear não atua como intermediadora de negócios, não sendo
                responsável pela qualidade, procedência, entrega, garantias ou
                obrigações tributárias das vendas realizadas.
              </li>
              <li>
                É terminantemente proibida a comercialização de produtos
                ilícitos, falsificados, ou que violem direitos autorais e de
                propriedade intelectual de terceiros.
              </li>
              <li>
                O Lojista compromete-se a prestar suporte adequado aos seus
                clientes finais, respondendo diretamente por trocas, devoluções
                e reembolsos.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              3. Pagamentos, Taxas e Gateways
            </h2>
            <p>
              O processamento financeiro (PIX, Cartão de Crédito) é realizado
              por gateways de pagamento terceirizados integrados à Plataforma. A
              Bewear não se responsabiliza por:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Aprovações ou recusas de transações;</li>
              <li>Retenção de fundos pelo gateway;</li>
              <li>
                Contestações de compra (Chargebacks) ou fraudes cometidas por
                clientes finais. O risco da operação comercial é integralmente
                do Lojista.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              4. Disponibilidade do Serviço
            </h2>
            <p>
              A Bewear envidará seus melhores esforços para manter a Plataforma
              acessível e operacional. No entanto, por se tratar de serviço de
              tecnologia, não garantimos disponibilidade ininterrupta, estando o
              sistema sujeito a manutenções preventivas e instabilidades de
              infraestrutura de nuvem.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              5. Propriedade Intelectual
            </h2>
            <p>
              A infraestrutura, código-fonte, layout estrutural e a marca Bewear
              são de nossa propriedade exclusiva. O Lojista detém a propriedade
              exclusiva sobre sua própria marca, logotipos, cadastros de
              produtos e base de clientes.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              6. Foro e Legislação Aplicável
            </h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do
              Brasil. Para dirimir quaisquer controvérsias, fica eleito o foro
              da Comarca de Patos, Estado da Paraíba, com renúncia expressa a
              qualquer outro, por mais privilegiado que seja.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
