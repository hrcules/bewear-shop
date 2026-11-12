"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteCategory } from "@/actions/delete-category";

import { CategoryDialog } from "./category-dialog";

interface CategoriesClientProps {
  categories: {
    id: string;
    name: string;
    slug: string;
  }[];
  colorPrimary: string;
}

export const CategoriesClient = ({
  categories,
  colorPrimary,
}: CategoriesClientProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<{
    id: string;
    name: string;
    slug: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleEdit = (category: { id: string; name: string; slug: string }) => {
    setSelectedCategory(category);
    setIsOpen(true);
  };

  const handleCreate = () => {
    setSelectedCategory(null);
    setIsOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (categories.length <= 1) {
      toast.error("Você não pode excluir a única categoria da sua loja.");
      return;
    }

    if (
      window.confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)
    ) {
      startTransition(async () => {
        try {
          const result = await deleteCategory(id);

          if (!result.success) {
            toast.error(
              result.error ?? "Não foi possível excluir a categoria.",
            );
            return;
          }

          toast.success("Categoria excluída com sucesso!");
        } catch {
          toast.error("Ocorreu um erro ao excluir.");
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Categorias</h2>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suas Categorias ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-semibold">{category.name}</p>
                  <p className="text-muted-foreground text-sm">
                    /{category.slug}
                  </p>
                </div>

                {/* Agrupamos os botões de ação */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(category)}
                  >
                    Editar
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 cursor-pointer hover:bg-red-300"
                    onClick={() => handleDelete(category.id, category.name)}
                    disabled={isPending || categories.length <= 1}
                    title={
                      categories.length <= 1
                        ? "É necessário ter pelo menos 1 categoria"
                        : "Excluir"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {categories.length === 0 && (
              <p className="text-muted-foreground py-8 text-center">
                Nenhuma categoria encontrada.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <CategoryDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        category={selectedCategory}
        colorPrimary={colorPrimary}
      />
    </div>
  );
};
