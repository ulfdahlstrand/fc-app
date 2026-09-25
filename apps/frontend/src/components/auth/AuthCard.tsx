/** The frame every signed-out page shares: one card, a heading, a line of help. */
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function AuthCard({
  heading,
  description,
  children,
}: {
  heading: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-16 flex flex-col items-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6">
          <div className="text-center">
            <h1 className="font-display text-2xl">{heading}</h1>
            {description && (
              <p className="mt-1 text-muted-foreground">{description}</p>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
