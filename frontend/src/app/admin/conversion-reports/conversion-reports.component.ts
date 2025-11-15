import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminService, ManuscriptReport, ConversionStatistics } from '../../shared/services/admin.service';
import { ErrorHandlerService } from '../../shared/services/error-handler.service';
import { NavigationComponent } from '../../shared/components/navigation/navigation.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';

@Component({
  selector: 'app-conversion-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavigationComponent, LoadingComponent],
  template: `
    <div class="min-h-screen bg-gray-50">
      <app-navigation></app-navigation>

      <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div class="px-4 py-6 sm:px-0">
          <!-- Header -->
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900">Conversion Reports</h1>
            <p class="mt-1 text-sm text-gray-600">
              View and manage manuscript conversion jobs
            </p>
          </div>

          <!-- Statistics Cards -->
          <div *ngIf="statistics" class="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <div class="bg-white overflow-hidden shadow rounded-lg">
              <div class="p-5">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div class="ml-5 w-0 flex-1">
                    <dl>
                      <dt class="text-sm font-medium text-gray-500 truncate">Total</dt>
                      <dd class="text-lg font-medium text-gray-900">{{ statistics.total_manuscripts }}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-yellow-50 overflow-hidden shadow rounded-lg">
              <div class="p-5">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <svg class="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div class="ml-5 w-0 flex-1">
                    <dl>
                      <dt class="text-sm font-medium text-yellow-700 truncate">Processing</dt>
                      <dd class="text-lg font-medium text-yellow-900">{{ statistics.processing_count }}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-green-50 overflow-hidden shadow rounded-lg">
              <div class="p-5">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div class="ml-5 w-0 flex-1">
                    <dl>
                      <dt class="text-sm font-medium text-green-700 truncate">Completed</dt>
                      <dd class="text-lg font-medium text-green-900">{{ statistics.completed_count }}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-red-50 overflow-hidden shadow rounded-lg">
              <div class="p-5">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div class="ml-5 w-0 flex-1">
                    <dl>
                      <dt class="text-sm font-medium text-red-700 truncate">Failed</dt>
                      <dd class="text-lg font-medium text-red-900">{{ statistics.failed_count }}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-blue-50 overflow-hidden shadow rounded-lg">
              <div class="p-5">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div class="ml-5 w-0 flex-1">
                    <dl>
                      <dt class="text-sm font-medium text-blue-700 truncate">Success Rate</dt>
                      <dd class="text-lg font-medium text-blue-900">{{ statistics.success_rate }}%</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Filters -->
          <div class="bg-white shadow rounded-lg p-6 mb-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Filters</h3>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label for="status" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  id="status"
                  name="status"
                  [(ngModel)]="filters.status"
                  (change)="applyFilters()"
                  class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="complete">Complete</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label for="inputFormat" class="block text-sm font-medium text-gray-700 mb-1">Input Format</label>
                <select
                  id="inputFormat"
                  name="inputFormat"
                  [(ngModel)]="filters.inputFormat"
                  (change)="applyFilters()"
                  class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="">All Formats</option>
                  <option value="pdf">PDF</option>
                  <option value="epub">EPUB</option>
                </select>
              </div>

              <div>
                <label for="isbn" class="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
                <input
                  type="text"
                  id="isbn"
                  name="isbn"
                  [(ngModel)]="filters.isbn"
                  (keyup.enter)="applyFilters()"
                  placeholder="Search by ISBN"
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div>
                <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <input
                  type="text"
                  id="search"
                  name="search"
                  [(ngModel)]="filters.search"
                  (keyup.enter)="applyFilters()"
                  placeholder="File name or ISBN"
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>

            <div class="mt-4 flex justify-end space-x-3">
              <button
                type="button"
                (click)="clearFilters()"
                class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Clear Filters
              </button>
              <button
                type="button"
                (click)="applyFilters()"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Apply Filters
              </button>
            </div>
          </div>

          <!-- Reports Table -->
          <div class="bg-white shadow rounded-lg overflow-hidden">
            <div class="px-4 py-5 sm:p-6">
              <div *ngIf="isLoading" class="flex justify-center py-12">
                <app-loading message="Loading conversion reports..." size="lg"></app-loading>
              </div>

              <div *ngIf="!isLoading && reports.length === 0" class="text-center py-12">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900">No conversion reports found</h3>
                <p class="mt-1 text-sm text-gray-500">Try adjusting your filters or check back later.</p>
              </div>

              <div *ngIf="!isLoading && reports.length > 0" class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Format</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ISBN</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Upload Date</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr *ngFor="let report of reports" class="hover:bg-gray-50">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {{ report.file_name }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ report.user_email || 'N/A' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span [ngClass]="getStatusClass(report.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                          {{ report.status }}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ report.input_format || 'N/A' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ report.isbn || 'N/A' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ report.upload_date | date:'short' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          type="button"
                          (click)="viewDetails(report)"
                          class="text-indigo-600 hover:text-indigo-900"
                        >
                          View
                        </button>
                        <button
                          *ngIf="report.status === 'failed'"
                          type="button"
                          (click)="retryConversion(report.id)"
                          class="text-green-600 hover:text-green-900"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Pagination -->
              <div *ngIf="!isLoading && reports.length > 0" class="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                <div class="flex-1 flex justify-between sm:hidden">
                  <button
                    (click)="previousPage()"
                    [disabled]="currentPage === 1"
                    class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    (click)="nextPage()"
                    [disabled]="currentPage >= totalPages"
                    class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p class="text-sm text-gray-700">
                      Showing
                      <span class="font-medium">{{ (currentPage - 1) * pageSize + 1 }}</span>
                      to
                      <span class="font-medium">{{ Math.min(currentPage * pageSize, totalItems) }}</span>
                      of
                      <span class="font-medium">{{ totalItems }}</span>
                      results
                    </p>
                  </div>
                  <div>
                    <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        (click)="previousPage()"
                        [disabled]="currentPage === 1"
                        class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span class="sr-only">Previous</span>
                        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                      </button>
                      <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                        Page {{ currentPage }} of {{ totalPages }}
                      </span>
                      <button
                        (click)="nextPage()"
                        [disabled]="currentPage >= totalPages"
                        class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span class="sr-only">Next</span>
                        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Details Modal -->
      <div *ngIf="selectedReport" class="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" (click)="closeDetails()"></div>
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="sm:flex sm:items-start">
                <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
                  <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    Conversion Details
                  </h3>
                  <div class="mt-4 space-y-3">
                    <div>
                      <p class="text-sm font-medium text-gray-500">File Name</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.file_name }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">User</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.user_email || 'N/A' }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Status</p>
                      <span [ngClass]="getStatusClass(selectedReport.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                        {{ selectedReport.status }}
                      </span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Input Format</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.input_format || 'N/A' }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">ISBN</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.isbn || 'N/A' }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">File Size</p>
                      <p class="text-sm text-gray-900">{{ formatFileSize(selectedReport.file_size) }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Upload Date</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.upload_date | date:'medium' }}</p>
                    </div>
                    <div *ngIf="selectedReport.processing_started_at">
                      <p class="text-sm font-medium text-gray-500">Processing Started</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.processing_started_at | date:'medium' }}</p>
                    </div>
                    <div *ngIf="selectedReport.processing_completed_at">
                      <p class="text-sm font-medium text-gray-500">Processing Completed</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.processing_completed_at | date:'medium' }}</p>
                    </div>
                    <div *ngIf="selectedReport.error_message">
                      <p class="text-sm font-medium text-red-500">Error Message</p>
                      <p class="text-sm text-red-700 bg-red-50 p-2 rounded">{{ selectedReport.error_message }}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Retry Count</p>
                      <p class="text-sm text-gray-900">{{ selectedReport.retry_count }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                (click)="closeDetails()"
                class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Close
              </button>
              <button
                *ngIf="selectedReport.status === 'failed'"
                type="button"
                (click)="retryConversion(selectedReport.id); closeDetails()"
                class="mt-3 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:mt-0 sm:w-auto sm:text-sm"
              >
                Retry Conversion
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ConversionReportsComponent implements OnInit {
  reports: ManuscriptReport[] = [];
  statistics: ConversionStatistics | null = null;
  selectedReport: ManuscriptReport | null = null;

  filters = {
    status: '',
    inputFormat: '',
    isbn: '',
    search: ''
  };

  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  totalPages = 0;

  isLoading = false;
  Math = Math;

  constructor(
    private adminService: AdminService,
    private errorHandler: ErrorHandlerService
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
    this.loadReports();
  }

  loadStatistics(): void {
    this.adminService.getConversionStatistics().subscribe({
      next: (stats) => {
        this.statistics = stats;
      },
      error: (error) => {
        this.errorHandler.showError(error);
      }
    });
  }

  loadReports(): void {
    this.isLoading = true;
    const params = {
      page: this.currentPage,
      size: this.pageSize,
      ...this.filters
    };

    this.adminService.getManuscriptReports(params).subscribe({
      next: (response) => {
        this.reports = response.items;
        this.totalItems = response.total;
        this.totalPages = response.pages;
        this.isLoading = false;
      },
      error: (error) => {
        this.errorHandler.showError(error);
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadReports();
  }

  clearFilters(): void {
    this.filters = {
      status: '',
      inputFormat: '',
      isbn: '',
      search: ''
    };
    this.applyFilters();
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadReports();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadReports();
    }
  }

  viewDetails(report: ManuscriptReport): void {
    this.selectedReport = report;
  }

  closeDetails(): void {
    this.selectedReport = null;
  }

  retryConversion(manuscriptId: string): void {
    if (confirm('Are you sure you want to retry this conversion?')) {
      this.adminService.retryConversion(manuscriptId).subscribe({
        next: () => {
          this.errorHandler.showSuccess('Conversion queued for retry');
          this.loadReports();
          this.loadStatistics();
        },
        error: (error) => {
          this.errorHandler.showError(error);
        }
      });
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  formatFileSize(bytes: number | null | undefined): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}
