import { Suspense } from "react";
import { CompareClient } from "./compare-client";

export const metadata = { title: "השוואת מחירים | SuperSave" };

export default function ComparePage() {
  return (
    <Suspense>
      <CompareClient />
    </Suspense>
  );
}
