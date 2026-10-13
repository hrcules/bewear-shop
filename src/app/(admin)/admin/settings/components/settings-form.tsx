"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Image as ImageIcon,
  Palette,
  UploadCloud,
  X,
  Link as LinkIcon,
  Loader2,
  Truck,
  QrCode,
  Store,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { updateStoreSettingsAction } from "@/actions/update-store-settings";
import {
  updateStoreSettingsSchema,
  type UpdateStoreSettingsInput,
} from "@/actions/update-store-settings/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface SettingsFormProps {
  initialData: {
    id: string;
    name: string;
    colorPrimary: string;
    logoUrl: string | null;
    banner1DesktopUrl: string | null;
    banner1MobileUrl: string | null;
    banner2DesktopUrl: string | null;
    banner2MobileUrl: string | null;
    instagramUrl: string | null;
    whatsapp: string | null;
    fixedShippingFeeInCents: number;
    freeShippingThresholdInCents: number | null;
    stripePublicKey: string | null;
    stripeSecretKey: string | null;
    stripeWebhookSecret: string | null;
    mpAccessToken: string | null;
    pixDiscountPercent: number;
    enableOnlinePayments: boolean;
  };
}

// ✅ NOVO: Função para aplicar a máscara (DDD) 99999-9999
const formatPhone = (value: string) => {
  if (!value) return "";
  let v = value.replace(/\D/g, ""); // Remove tudo que não for número

  // Caso o usuário já tenha salvo antes com '55' no banco (ex: 5511999999999),
  // removemos o 55 para formatar corretamente no visual.
  if (v.startsWith("55") && v.length === 13) {
    v = v.slice(2);
  }

  v = v.slice(0, 11); // Limita a 11 dígitos (DDD + 9 dígitos)

  if (v.length >= 3) {
    v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  }
  if (v.length >= 10) {
    v = `${v.slice(0, 10)}-${v.slice(10)}`;
  }

  return v;
};

export function SettingsForm({ initialData }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();

  const [logoPreview, setLogoPreview] = useState(initialData.logoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [b1DeskPreview, setB1DeskPreview] = useState(
    initialData.banner1DesktopUrl,
  );
  const [b1DeskFile, setB1DeskFile] = useState<File | null>(null);
  const [b1MobPreview, setB1MobPreview] = useState(
    initialData.banner1MobileUrl,
  );
  const [b1MobFile, setB1MobFile] = useState<File | null>(null);

  const [b2DeskPreview, setB2DeskPreview] = useState(
    initialData.banner2DesktopUrl,
  );
  const [b2DeskFile, setB2DeskFile] = useState<File | null>(null);
  const [b2MobPreview, setB2MobPreview] = useState(
    initialData.banner2MobileUrl,
  );
  const [b2MobFile, setB2MobFile] = useState<File | null>(null);

  const form = useForm<UpdateStoreSettingsInput>({
    resolver: zodResolver(updateStoreSettingsSchema),
    defaultValues: {
      name: initialData.name,
      colorPrimary: initialData.colorPrimary,
      instagramUrl: initialData.instagramUrl || "",
      whatsapp: initialData.whatsapp || "",

      enableOnlinePayments: initialData.enableOnlinePayments ?? true,

      stripePublicKey: initialData.stripePublicKey || "",
      stripeSecretKey: initialData.stripeSecretKey || "",
      stripeWebhookSecret: initialData.stripeWebhookSecret || "",
      mpAccessToken: initialData.mpAccessToken || "",

      pixDiscountPercent: initialData.pixDiscountPercent.toString(),

      fixedShippingFee: (initialData.fixedShippingFeeInCents / 100).toString(),
      freeShippingThreshold: initialData.freeShippingThresholdInCents
        ? (initialData.freeShippingThresholdInCents / 100).toString()
        : "",
    },
  });

  const isOnlinePaymentsEnabled = form.watch("enableOnlinePayments");

  const onSubmit = (data: UpdateStoreSettingsInput) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("colorPrimary", data.colorPrimary);
    if (data.instagramUrl) formData.append("instagramUrl", data.instagramUrl);

    // Na hora de salvar, enviamos os números limpos para o banco
    if (data.whatsapp) {
      const cleanWhatsapp = data.whatsapp.replace(/\D/g, "");
      formData.append("whatsapp", cleanWhatsapp);
    }

    formData.append("enableOnlinePayments", String(data.enableOnlinePayments));

    if (data.stripePublicKey)
      formData.append("stripePublicKey", data.stripePublicKey);
    if (data.stripeSecretKey)
      formData.append("stripeSecretKey", data.stripeSecretKey);
    if (data.stripeWebhookSecret)
      formData.append("stripeWebhookSecret", data.stripeWebhookSecret);

    if (data.mpAccessToken)
      formData.append("mpAccessToken", data.mpAccessToken);

    if (data.pixDiscountPercent)
      formData.append("pixDiscountPercent", data.pixDiscountPercent);

    const fixedCents = Math.round(Number(data.fixedShippingFee) * 100);
    formData.append("fixedShippingFeeInCents", fixedCents.toString());

    if (data.freeShippingThreshold && Number(data.freeShippingThreshold) > 0) {
      const thresholdCents = Math.round(
        Number(data.freeShippingThreshold) * 100,
      );
      formData.append(
        "freeShippingThresholdInCents",
        thresholdCents.toString(),
      );
    } else {
      formData.append("freeShippingThresholdInCents", "");
    }

    if (logoFile) formData.append("logoFile", logoFile);
    if (!logoPreview && !logoFile) formData.append("removeLogo", "true");

    if (b1DeskFile) formData.append("b1DesktopFile", b1DeskFile);
    if (!b1DeskPreview && !b1DeskFile) formData.append("removeB1D", "true");

    if (b1MobFile) formData.append("b1MobileFile", b1MobFile);
    if (!b1MobPreview && !b1MobFile) formData.append("removeB1M", "true");

    if (b2DeskFile) formData.append("b2DesktopFile", b2DeskFile);
    if (!b2DeskPreview && !b2DeskFile) formData.append("removeB2D", "true");

    if (b2MobFile) formData.append("b2MobileFile", b2MobFile);
    if (!b2MobPreview && !b2MobFile) formData.append("removeB2M", "true");

    startTransition(async () => {
      try {
        await updateStoreSettingsAction(formData);
        toast.success("Configurações salvas com sucesso!");
      } catch {
        toast.error("Erro ao salvar as configurações.");
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="border-primary/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" /> Modelo de Vendas
            </CardTitle>
            <CardDescription>
              Escolha se deseja receber pagamentos online automaticamente ou
              operar como um catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              name="enableOnlinePayments"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold">
                      Aceitar Pagamentos Online
                    </FormLabel>
                    <p className="text-muted-foreground text-[13px]">
                      Se desativado, o checkout apenas reservará o estoque e o
                      cliente finalizará o pagamento manualmente via WhatsApp.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" /> Identidade Visual
            </CardTitle>
            <CardDescription>
              Nome da loja e cor principal do tema.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <FormField
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Loja</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Minha Loja"
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name="colorPrimary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor Principal</FormLabel>
                  <FormControl>
                    <div className="flex gap-3">
                      <Input
                        type="color"
                        className="h-10 w-14 cursor-pointer p-1"
                        disabled={isPending}
                        {...field}
                      />
                      <Input
                        placeholder="#8B5CF6"
                        disabled={isPending}
                        {...field}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" /> Imagens da Vitrine
            </CardTitle>
            <CardDescription>
              Logo e Banners (Versões para Computador e Celular).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <ImageUploadBox
              id="logo-upload"
              label="Logo da Loja"
              preview={logoPreview}
              isPending={isPending}
              onFileSelect={(file: File, url: string) => {
                setLogoFile(file);
                setLogoPreview(url);
              }}
              onClear={() => {
                setLogoFile(null);
                setLogoPreview(null);
              }}
            />

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold tracking-tight">
                Primeiro Banner
              </h3>
              <div className="grid gap-6 md:grid-cols-2">
                <ImageUploadBox
                  id="b1-desk-upload"
                  label="Versão Desktop (Ex: 1352x800)"
                  preview={b1DeskPreview}
                  isPending={isPending}
                  onFileSelect={(file: File, url: string) => {
                    setB1DeskFile(file);
                    setB1DeskPreview(url);
                  }}
                  onClear={() => {
                    setB1DeskFile(null);
                    setB1DeskPreview(null);
                  }}
                />
                <ImageUploadBox
                  id="b1-mob-upload"
                  label="Versão Mobile (Ex: 365x460)"
                  preview={b1MobPreview}
                  isPending={isPending}
                  onFileSelect={(file: File, url: string) => {
                    setB1MobFile(file);
                    setB1MobPreview(url);
                  }}
                  onClear={() => {
                    setB1MobFile(null);
                    setB1MobPreview(null);
                  }}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold tracking-tight">
                Segundo Banner (Opcional)
              </h3>
              <div className="grid gap-6 md:grid-cols-2">
                <ImageUploadBox
                  id="b2-desk-upload"
                  label="Versão Desktop (Ex: 1352x800)"
                  preview={b2DeskPreview}
                  isPending={isPending}
                  onFileSelect={(file: File, url: string) => {
                    setB2DeskFile(file);
                    setB2DeskPreview(url);
                  }}
                  onClear={() => {
                    setB2DeskFile(null);
                    setB2DeskPreview(null);
                  }}
                />
                <ImageUploadBox
                  id="b2-mob-upload"
                  label="Versão Mobile (Ex: 365x460)"
                  preview={b2MobPreview}
                  isPending={isPending}
                  onFileSelect={(file: File, url: string) => {
                    setB2MobFile(file);
                    setB2MobPreview(url);
                  }}
                  onClear={() => {
                    setB2MobFile(null);
                    setB2MobPreview(null);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Logística e Frete
            </CardTitle>
            <CardDescription>
              Defina o valor do frete padrão e o limite de gastos para o cliente
              ganhar frete grátis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <FormField
              name="fixedShippingFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Fixo do Frete (R$)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 25.00"
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name="freeShippingThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Frete Grátis a partir de (R$) (Opcional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 200.00 ou deixe vazio"
                      {...field}
                      value={field.value ?? ""}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {isOnlinePaymentsEnabled && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" /> Pagamentos (Cartão via
                  Stripe)
                </CardTitle>
                <CardDescription>
                  Conecte sua conta do Stripe para processar cartões de crédito
                  de forma segura.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  name="stripePublicKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chave Pública (Publishable Key)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="pk_test_..."
                          {...field}
                          value={field.value || ""}
                          disabled={isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  name="stripeSecretKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chave Secreta (Secret Key)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="sk_test_..."
                          {...field}
                          value={field.value || ""}
                          disabled={isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  name="stripeWebhookSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segredo do Webhook (Webhook Secret)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="whsec_..."
                          {...field}
                          value={field.value || ""}
                          disabled={isPending}
                        />
                      </FormControl>
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        Configure seu Webhook no Stripe para apontar para:
                        <code className="bg-muted ml-1 rounded px-1 py-0.5">
                          {process.env.NEXT_PUBLIC_APP_URL}
                          /api/stripe/webhook?storeId={initialData.id}
                        </code>
                      </p>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-600">
                  <QrCode className="h-5 w-5" /> Pagamentos (PIX via Mercado
                  Pago)
                </CardTitle>
                <CardDescription>
                  Gere QR Codes de PIX com aprovação instantânea e ofereça
                  descontos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  name="mpAccessToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Token (Produção)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="APP_USR-..."
                          {...field}
                          value={field.value || ""}
                          disabled={isPending}
                        />
                      </FormControl>
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        Gere este token no painel de desenvolvedores do Mercado
                        Pago (Credenciais de Produção).
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  name="pixDiscountPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desconto para PIX (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Ex: 5 para 5% de desconto"
                          {...field}
                          disabled={isPending}
                        />
                      </FormControl>
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        Incentive vendas à vista oferecendo um desconto
                        automático no checkout (Deixe 0 para nenhum).
                      </p>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" /> Contato e Redes Sociais
            </CardTitle>
            <CardDescription>
              Links que ficarão disponíveis no rodapé da sua loja.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <FormField
              name="instagramUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link do Instagram</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://instagram.com/sua_loja"
                      {...field}
                      value={field.value || ""}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {/* ✅ AQUI ESTÁ A MÁSCARA SENDO APLICADA */}
            <FormField
              name="whatsapp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do WhatsApp</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="(11) 99999-9999"
                      {...field}
                      // Aplica a máscara no valor atual do state
                      value={formatPhone(field.value || "")}
                      // Aplica a máscara no momento da digitação
                      onChange={(e) => {
                        field.onChange(formatPhone(e.target.value));
                      }}
                      maxLength={15}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ImageUploadBox({
  id,
  label,
  preview,
  isPending,
  onFileSelect,
  onClear,
}: {
  id: string;
  label: string;
  preview: string | null;
  isPending: boolean;
  onFileSelect: (file: File, url: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <div className="relative mt-2 flex justify-center rounded-lg border border-dashed px-6 py-6">
        {preview ? (
          <div className="relative h-32 w-full max-w-[300px]">
            <Image
              src={preview}
              alt="Preview"
              fill
              className="rounded-md object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full"
              onClick={onClear}
              disabled={isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <UploadCloud className="text-muted-foreground mx-auto h-8 w-8" />
            <label
              htmlFor={id}
              className="text-primary mt-2 block cursor-pointer text-sm font-semibold hover:underline"
            >
              Escolher Foto
              <input
                id={id}
                type="file"
                className="sr-only"
                accept="image/*"
                disabled={isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSelect(file, URL.createObjectURL(file));
                }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
