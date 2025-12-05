# RittDoc DTD Validation Guide

## Critical Requirement: lxml Must Be Installed

**IMPORTANT**: The DTD validator requires `lxml` to function. Without it, validation is **silently disabled** and will return no errors even for invalid XML!

### Install lxml

```bash
pip install lxml
```

## How the Validator Works

The validator (`validate_with_entity_tracking.py`) performs comprehensive DTD validation by:

1. **Loading the RittDoc DTD** from `RITTDOCdtd/v1.1/RittDocBook.dtd`
2. **Parsing each chapter file** individually
3. **Validating against the DTD** using lxml's DTD validator
4. **Reporting errors** with actual filename and line numbers

### What the Validator Catches

The validator detects **ALL DTD violations**, including:

#### 1. Invalid Content Model Errors
- Elements in wrong order
- Disallowed child elements
- **Example**: `<para>` directly under `<chapter>` instead of inside `<sect1>`

```xml
<!-- INVALID -->
<chapter id="ch01">
    <title>Chapter Title</title>
    <para>This violates the DTD!</para>  ← ERROR: para not allowed here
</chapter>

<!-- VALID -->
<chapter id="ch01">
    <title>Chapter Title</title>
    <sect1 id="ch01-s1">
        <title>Section Title</title>
        <para>This is valid!</para>  ← Correct: para inside sect1
    </sect1>
</chapter>
```

#### 2. Undeclared Elements
- Elements not defined in the DTD
- Custom tags without DTD declarations

#### 3. Missing Required Attributes
- Missing `id` attributes where required
- Missing `fileref` in images, etc.

#### 4. Missing Required Child Elements
- Empty elements that require children
- Missing required tags like `<title>`, `<entry>`, etc.

#### 5. Invalid Attribute Values
- Attributes with values not in DTD enumeration
- Wrong attribute types

## Chapter Element Rules

According to `ritthier2.mod`, `<chapter>` can **ONLY** contain:

```
<chapter>
  beginpage?          (optional)
  chapterinfo?        (optional)
  title               (REQUIRED)
  subtitle?           (optional)
  titleabbrev?        (optional)
  tocchap?            (optional)
  (toc | lot | index | glossary | bibliography | sect1)*  (zero or more)
</chapter>
```

### What Must Be Wrapped in `<sect1>`

**ALL content elements** must be inside `<sect1>`, including:

- `<para>`, `<formalpara>`, `<simpara>`
- `<figure>`, `<informalfigure>`, `<table>`, `<informaltable>`
- `<itemizedlist>`, `<orderedlist>`, `<variablelist>`
- `<programlisting>`, `<screen>`, `<literallayout>`
- `<blockquote>`
- `<note>`, `<warning>`, `<caution>`, `<important>`, `<tip>`
- `<example>`, `<informalexample>`
- `<equation>`, `<informalequation>`
- `<sidebar>`, `<procedure>`, `<abstract>`, `<epigraph>`
- **Any other content element not in the allowed list above**

## Running Validation

### Validate a ZIP Package

```bash
python3 validate_with_entity_tracking.py package.zip
```

This will:
- Extract all files
- Validate each chapter against the DTD
- Generate an Excel report with all errors
- Exit with code 1 if errors found, 0 if valid

### Validate with Custom DTD Path

```bash
python3 validate_with_entity_tracking.py package.zip --dtd path/to/RittDocBook.dtd
```

### Specify Output Report Path

```bash
python3 validate_with_entity_tracking.py package.zip -o custom_report.xlsx
```

## Validation Report

The validator generates an Excel report with:

- **XML File**: Actual chapter filename (e.g., `ch0007.xml`)
- **Line Number**: Exact line in that chapter file
- **Error Type**: Category (Invalid Content Model, Missing Attribute, etc.)
- **Error Description**: Human-readable explanation
- **Severity**: Error/Warning

## Common Validation Errors

### Error: "Element chapter content does not follow the DTD"

**Cause**: Chapter has disallowed direct children (e.g., `<para>`, `<figure>`, `<note>`)

**Solution**: Wrap content in `<sect1>`

```bash
# Use the automatic fixer
python3 fix_chapter_dtd_violations.py package.zip
```

### Error: "No declaration for element"

**Cause**: Using an element not defined in the DTD

**Solution**: Remove the element or use a DTD-compliant alternative

### Error: "Element X does not carry attribute id"

**Cause**: Missing required `id` attribute

**Solution**: Add `id` attribute to the element

## Pre-Submission Checklist

Before sending XML to customers:

1. ✅ **Verify lxml is installed**: `pip list | grep lxml`
2. ✅ **Run full DTD validation**: `python3 validate_with_entity_tracking.py package.zip`
3. ✅ **Check report**: Ensure 0 validation errors
4. ✅ **Review any warnings**: Address if critical
5. ✅ **Test with customer's validator** (if available)

## Why Validation Was Failing

Previously, validation appeared to pass but was actually **not running** because:

1. `lxml` was not installed
2. The validator silently returned empty error lists
3. No warnings were shown

**Now fixed**: The validator will fail immediately if lxml is not installed, preventing false confidence in invalid XML.

## Integration with Fixing Scripts

The validation works hand-in-hand with automatic fixers:

1. **Run validator**: Identify DTD violations
2. **Run fixer**: Auto-fix common issues
   ```bash
   python3 fix_chapter_dtd_violations.py package.zip
   ```
3. **Re-validate**: Verify fixes worked
4. **Manual review**: Check auto-generated elements (titles, etc.)

## Customer Validation

Your customer likely uses:

- **xmllint** with DTD validation
- **Saxon** or other XSLT processors with validation
- **Oxygen XML Editor** with DTD validation
- **Custom validators** specific to their workflow

All of these will catch DTD violations. The `lxml`-based validator in this repository uses the same DTD rules and should catch the same errors.

## Troubleshooting

### "lxml not available" Error

**Solution**: Install lxml
```bash
pip install lxml
```

### Validation Passes But Customer Rejects

**Possible causes**:
1. Using different DTD version (check version number)
2. Customer has additional custom rules
3. Encoding issues (ensure UTF-8)
4. Entity resolution differences

**Solution**: Request customer's exact DTD and test files

### Performance Issues

For large packages:
- Validation is done per-chapter (parallelizable in future)
- Typical speed: ~10-50 chapters/second depending on complexity
- Use SSD for better I/O performance

## Summary

✅ **Validator IS comprehensive** - catches all DTD violations when lxml is installed
✅ **Content model errors ARE detected** - including para under chapter
✅ **Now fails loudly** if lxml is missing
✅ **Safe for customer submission** - same rules as customer validators

**Always validate with lxml installed before final submission!**
