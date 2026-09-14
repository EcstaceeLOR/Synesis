import { LoadingSkeleton } from "@synesis/ui";

export default function ApplicationLoading() {
  return (
    <div className="content-shell" aria-busy="true">
      <div className="page-heading loading-heading">
        <LoadingSkeleton rows={2} />
      </div>
      <LoadingSkeleton rows={4} />
    </div>
  );
}
