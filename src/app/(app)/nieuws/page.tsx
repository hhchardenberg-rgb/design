import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function NieuwsPage() {
  const posts = await prisma.newsPost.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nieuws</h1>
        <p className="mt-1 text-muted-foreground">Het laatste nieuws voor Team Communicatie.</p>
      </div>

      {posts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen nieuwsberichten.</p>}

      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <Card key={post.id} className={post.pinned ? "border-hhc-orange" : undefined}>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {post.pinned && (
                  <Badge variant="primary" className="flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    Vastgezet
                  </Badge>
                )}
                {post.category && <Badge variant="outline">{post.category}</Badge>}
                <p className="font-semibold">{post.title}</p>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>
              <p className="text-xs text-muted-foreground">
                {format(post.createdAt, "d MMMM yyyy", { locale: nl })}
                {post.author?.name ? ` · ${post.author.name}` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
