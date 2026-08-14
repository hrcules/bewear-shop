import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-100 bg-white p-8 shadow-sm md:p-12">
        <Button variant="ghost" asChild className="mb-8 -ml-4 text-slate-500">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o início
          </Link>
        </Button>

        <h1 className="mb-4 text-3xl font-black text-slate-900">
          Política de Privacidade
        </h1>
        <p className="mb-8 text-slate-500">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="space-y-8 leading-relaxed text-slate-700">
          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              1. Nosso Compromisso com a LGPD
            </h2>
            <p>
              A <strong>Bewear</strong> está comprometida com a privacidade e a
              segurança dos dados de seus Lojistas e dos clientes finais. Esta
              Política estabelece como coletamos, usamos e protegemos as
              informações em conformidade com a Lei Geral de Proteção de Dados
              (Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              2. Posição da Plataforma (Controlador vs. Operador)
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Dados do Lojista:</strong> A Bewear atua como{" "}
                <em>Controladora</em> dos dados cadastrais do Lojista (nome,
                e-mail, documentos, dados de faturamento).
              </li>
              <li>
                <strong>Dados do Cliente Final:</strong> O Lojista é o{" "}
                <em>Controlador</em> dos dados de seus compradores. A Bewear
                atua estritamente como <em>Operadora</em>, armazenando e
                processando essas informações na infraestrutura em nuvem
                exclusivamente para viabilizar as vendas da respectiva loja.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              3. Dados Coletados
            </h2>
            <p>Coletamos as seguintes informações:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Dados Cadastrais:</strong> Nome completo, e-mail,
                telefone, CPF/CNPJ.
              </li>
              <li>
                <strong>Dados de Navegação:</strong> Endereço IP, tipo de
                navegador, páginas acessadas, cookies estatísticos e de sessão.
              </li>
              <li>
                <strong>Dados Transacionais:</strong> Histórico de pedidos e
                faturamento gerados na plataforma.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              4. Compartilhamento de Dados
            </h2>
            <p>
              A Bewear não vende ou aluga dados pessoais. O compartilhamento
              ocorre apenas de forma estritamente necessária com provedores de
              infraestrutura (como serviços de nuvem AWS) e gateways de
              pagamento homologados, que também possuem compromisso formal com a
              proteção de dados.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              5. Segurança da Informação
            </h2>
            <p>
              Utilizamos criptografia de ponta a ponta para senhas e conexões
              (SSL/HTTPS), além de controles de acesso rígidos. Apesar de
              adotarmos as melhores práticas do mercado de tecnologia, nenhum
              sistema é 100% invulnerável. Em caso de incidentes, notificaremos
              as partes envolvidas conforme exige a lei.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              6. Direitos do Titular dos Dados
            </h2>
            <p>
              Você pode solicitar acesso, correção, anonimização ou exclusão dos
              seus dados pessoais a qualquer momento. Clientes finais devem
              solicitar a exclusão diretamente ao Lojista responsável, o qual
              poderá processar a exclusão através do seu painel de controle.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              7. Contato
            </h2>
            <p>
              Para dúvidas ou solicitações relacionadas a esta Política de
              Privacidade, entre em contato através do e-mail:{" "}
              <strong>contato@bewear.com.br</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
