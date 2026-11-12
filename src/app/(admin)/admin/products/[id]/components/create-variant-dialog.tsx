"use client";

import { useState, useTransition, useEffect } from "react";
import { Loader2, Plus, UploadCloud, X, Copy } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVariantAction } from "@/actions/create-variant";
import { ColorCombobox } from "@/components/ui/color-combobox";

// A Vercel recusa requisições acima de ~4,5 MB; o servidor valida o mesmo limite
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function formatList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

// ✅ 1. Definimos o tipo dos dados que podem ser herdados
export interface VariantInitialData {
  priceInCents: number;
  stock: number;
  color: string;
  imageUrl: string;
}

interface CreateVariantDialogProps {
  productId: string;
  existingColors: string[];
  // ✅ 2. Adicionamos a propriedade opcional para herdar dados
  initialData?: VariantInitialData;
  // ✅ 3. Opcional: Se for um botão de duplicar, podemos mudar o texto/ícone
  isDuplicateMode?: boolean;
}

export function CreateVariantDialog({
  productId,
  existingColors,
  initialData,
  isDuplicateMode = false,
}: CreateVariantDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Foto herdada no modo "Duplicar" (some quando o lojista clica no X)
  const [inheritedImageUrl, setInheritedImageUrl] = useState<string | null>(
    null,
  );

  // ✅ 4. Efeito para preencher a imagem antiga quando o modal abre no modo "Duplicar"
  useEffect(() => {
    if (isOpen && initialData?.imageUrl) {
      setImagePreview(initialData.imageUrl);
      setInheritedImageUrl(initialData.imageUrl);
      setSelectedFile(null); // Zera o arquivo porque vamos usar a URL
    } else if (!isOpen) {
      // Limpa os estados quando fecha
      setImagePreview(null);
      setInheritedImageUrl(null);
      setSelectedFile(null);
    }
  }, [isOpen, initialData]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("O arquivo escolhido não é uma imagem.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("A imagem passa de 4 MB. Escolha uma foto menor.");
        return;
      }
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    formData.set("productId", productId);

    // ✅ 5. Confere os campos antes de enviar e diz exatamente o que falta
    const missing: string[] = [];
    if (!String(formData.get("color") ?? "").trim()) missing.push("Cor");
    if (!String(formData.get("size") ?? "").trim()) missing.push("Tamanho");
    if (!String(formData.get("price") ?? "").trim()) missing.push("Preço");
    if (!String(formData.get("stock") ?? "").trim()) missing.push("Estoque");
    if (!selectedFile && !inheritedImageUrl) missing.push("Imagem");

    if (missing.length > 0) {
      toast.error(
        `Não foi possível adicionar a variação: falta preencher ${formatList(missing)}.`,
      );
      return;
    }

    // ✅ 6. A lógica de envio da imagem:
    if (selectedFile) {
      // Se ele escolheu uma foto nova, envia o arquivo (como antes)
      formData.set("image", selectedFile);
    } else if (inheritedImageUrl) {
      // Se ele NÃO escolheu foto nova, mas tem foto antiga, manda a URL escondida!
      // IMPORTANTE: Seu backend precisará ler essa string agora!
      formData.set("previousImageUrl", inheritedImageUrl);

      // Enviamos um Blob vazio no campo "image" só para o FormData não quebrar caso o backend exija o campo
      formData.set("image", new Blob([], { type: "application/octet-stream" }));
    }

    startTransition(async () => {
      try {
        const result = await createVariantAction(formData);

        if (!result.success) {
          toast.error(result.error ?? "Não foi possível adicionar a variação.");
          return;
        }

        toast.success("Variação adicionada com sucesso!");
        setIsOpen(false);
      } catch (error) {
        console.error(error);
        toast.error(
          "Não foi possível adicionar a variação. Verifique sua conexão e tente novamente.",
        );
      }
    });
  };

  // ✅ 7. Função auxiliar para formatar centavos herdados para o input (Ex: 8990 -> "89.90")
  const formatPriceForInput = (cents?: number) => {
    if (!cents) return "";
    return (cents / 100).toFixed(2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {isDuplicateMode ? (
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-primary h-8 w-8"
          >
            <Copy className="h-4 w-4" /> {/* Ícone menor para usar na tabela */}
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Adicionar Variação
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] md:min-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isDuplicateMode ? "Duplicar Variação" : "Nova Variação de Produto"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Preço Específico (R$)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                required
                disabled={isPending}
                // ✅ 8. Herda o preço
                defaultValue={formatPriceForInput(initialData?.priceInCents)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Quantidade em Estoque</Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                min="0"
                required
                disabled={isPending}
                // ✅ 9. Herda o estoque (ou zero)
                defaultValue={initialData?.stock ?? "0"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="color">Cor (Ex: Verde, Bege)</Label>
              {/* O combobox já envia o campo "color" e herda a cor no modo "Duplicar" */}
              <ColorCombobox
                existingColors={existingColors}
                disabled={isPending}
                defaultValue={initialData?.color}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Tamanho (Ex: P, M, 42)</Label>
              <Input
                id="size"
                name="size"
                required
                disabled={isPending}
                // ⚠️ Deixamos o tamanho VAZIO de propósito para forçar ele a digitar um novo!
                defaultValue=""
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Imagem da Variação</Label>
            <div className="relative mt-2 flex justify-center rounded-lg border border-dashed px-6 py-6">
              {imagePreview ? (
                <div className="relative h-32 w-32">
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="rounded-md object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => {
                      setImagePreview(null);
                      setSelectedFile(null);
                      setInheritedImageUrl(null); // Remove também a foto herdada
                    }}
                    disabled={isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <UploadCloud className="text-muted-foreground mx-auto h-8 w-8" />
                  <label
                    htmlFor="variant-image"
                    className="text-primary mt-2 block cursor-pointer text-sm font-semibold hover:underline"
                  >
                    Escolher Foto
                    <input
                      id="variant-image"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={isPending}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDuplicateMode ? "Salvar Cópia" : "Salvar Variação"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
