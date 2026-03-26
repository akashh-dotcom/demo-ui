import { Layers } from 'lucide-react';

function BatchOperations() {
  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-primary-500" />
        </div>
        <h2 className="text-2xl font-semibold text-secondary-900 mb-2">
          Batch Operations
        </h2>
        <p className="text-secondary-500 max-w-md">
          Process multiple manuscripts at once, manage batch conversion jobs, and monitor bulk operations. Coming soon.
        </p>
      </div>
    </div>
  );
}

export default BatchOperations;
