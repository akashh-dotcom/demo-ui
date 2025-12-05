#!/usr/bin/env python3
"""
Test script for verification report generation
"""

from pathlib import Path
from validation_report import ValidationReportGenerator, VerificationItem, ValidationError

def test_verification_report():
    """Test generating a validation report with verification items"""

    # Create report generator
    report = ValidationReportGenerator()

    # Add some sample validation errors
    report.add_error(ValidationError(
        xml_file="ch0001.xml",
        line_number=10,
        column_number=5,
        error_type="Invalid Content Model",
        error_description="Element <chapter> does not match allowed content",
        severity="Error"
    ))

    report.add_error(ValidationError(
        xml_file="ch0002.xml",
        line_number=25,
        column_number=None,
        error_type="Empty Element Error",
        error_description="Element <row> is empty but should have content",
        severity="Warning"
    ))

    # Add some verification items
    report.add_verification_item(VerificationItem(
        xml_file="ch0003.xml",
        line_number=15,
        fix_type="Content Model Fix - Wrapped Elements",
        fix_description="Wrapped violating elements in <sect1 id='ch0003-intro'> section",
        verification_reason="Generic 'Introduction' title was auto-generated. The wrapped content may need a more descriptive section title.",
        suggestion="Review the wrapped content and update the <title> element if a more specific title is appropriate."
    ))

    report.add_verification_item(VerificationItem(
        xml_file="ch0007.xml",
        line_number=42,
        fix_type="Misclassified Figure Conversion",
        fix_description='Converted empty <figure> to <table> with title: "Table 10.9-3 Examples of tests"',
        verification_reason="Automated conversion merged figure title with table data. Verify table structure and title are correct.",
        suggestion="Review the table structure (tgroup, rows, entries) and ensure the title accurately describes the table content."
    ))

    report.add_verification_item(VerificationItem(
        xml_file="ch0007.xml",
        line_number=89,
        fix_type="Misclassified Figure Conversion",
        fix_description='Converted empty <figure> to <table> with title: "Table 12.1 Common symptoms"',
        verification_reason="Automated conversion merged figure title with table data. Verify table structure and title are correct.",
        suggestion="Review the table structure (tgroup, rows, entries) and ensure the title accurately describes the table content."
    ))

    # Generate the Excel report
    output_path = Path("test_verification_report.xlsx")
    report.generate_excel_report(output_path, "Test Book - Verification Tracking")

    print(f"✓ Test report generated: {output_path}")
    print(f"  Errors: {len(report.errors)}")
    print(f"  Verification items: {len(report.verification_items)}")
    print()
    print("Please open the Excel file to verify:")
    print("  1. Summary sheet shows error counts and verification item count")
    print("  2. Validation Errors sheet has 2 errors")
    print("  3. Manual Verification sheet has 3 verification items")
    print("  4. All formatting and columns are correct")


if __name__ == "__main__":
    test_verification_report()
