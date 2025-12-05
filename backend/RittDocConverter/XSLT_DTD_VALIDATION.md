# XSLT Transformation and DTD Validation

This document describes the XSLT transformation and DTD validation features implemented in RittDocConverter to ensure all generated XML is compliant with the RittDoc DTD specification.

## Overview

The RittDocConverter now includes three layers of DTD compliance enforcement:

1. **XSLT Transformation** - Automatically transforms XML to RittDoc DTD compliant format
2. **DTD Packaging** - Includes DTD files in the output package
3. **Automated Validation** - Validates generated XML against the DTD during conversion

## Components

### 1. XSLT Transformation (`xslt/rittdoc_compliance.xslt`)

An XSLT 1.0 stylesheet that transforms generic DocBook XML to RittDoc DTD compliant format.

**Key Transformations:**
- Converts `<info>` to `<bookinfo>` (DocBook 4.x style)
- Converts generic `<section>` to numbered `<sect1>`, `<sect2>`, etc. based on nesting depth
- Ensures `<copyright>` always contains `<year>` element
- Ensures `<bookinfo>` has all required metadata elements
- Removes HTML5 elements and namespaces not supported by DocBook 4.x
- Fixes author structure to use `<personname>` wrapper

**Usage:**
```bash
# Transform XML file
python xslt_transformer.py input.xml output.xml

# Transform and validate
python xslt_transformer.py input.xml output.xml --validate RITTDOCdtd/v1.1/RittDocBook.dtd
```

### 2. XSLT Transformer Module (`xslt_transformer.py`)

Python module that applies XSLT transformations using lxml.

**Functions:**
- `load_xslt_transform(xslt_path)` - Load XSLT stylesheet
- `apply_xslt_transform(xml_input, xslt_transform, output_path)` - Apply transformation
- `transform_to_rittdoc_compliance(xml_input, output_path)` - Convenience function for RittDoc compliance
- `validate_and_transform(xml_path, output_path, dtd_path)` - Transform and validate in one step

**Integration in Pipeline:**
The XSLT transformation is automatically applied in `integrated_pipeline.py` at Step 4.5, right after structured.xml is created and before packaging.

### 3. DTD Validation (`validate_rittdoc.py`)

Standalone script for validating RittDoc XML packages and files.

**Features:**
- Validate ZIP packages containing Book.XML
- Validate individual XML files
- Apply XSLT transformation and then validate
- Support for custom DTD paths
- Detailed error reporting

**Usage:**
```bash
# Validate a ZIP package
python validate_rittdoc.py Output/mybook.zip

# Validate an XML file
python validate_rittdoc.py book.xml

# Transform and validate
python validate_rittdoc.py --transform input.xml output.xml

# Use custom DTD
python validate_rittdoc.py --dtd custom.dtd book.xml

# Verbose output
python validate_rittdoc.py --verbose Output/mybook.zip
```

## Integration in Conversion Pipeline

The conversion pipeline (`integrated_pipeline.py`) now includes these validation steps:

### Step 4.5: XSLT Transformation
- Applied after structured.xml is created
- Transforms XML to RittDoc DTD compliant format
- Creates `structured_compliant.xml`
- Falls back to original if transformation fails

### Step 5: Packaging
- Includes DTD files in the ZIP package
- DTD files are added to `RITTDOCdtd/v1.1/` directory in the ZIP
- Includes all `.dtd`, `.mod`, and `.ent` files

### Step 6: DTD Validation
- Automatically validates the packaged Book.XML against RittDoc DTD
- Uses DTD from package if available, falls back to workspace DTD
- Reports validation success or detailed errors

## Critical DTD Compliance Fixes

### BANNED Elements Fixed by XSLT

The following elements are BANNED in RittDoc DTD and are automatically converted:

1. **`<variablelist>` → `<glosslist>`** (BANNED: rittexclusions.mod:138)
2. **`<varlistentry>` → `<glossentry>`** (BANNED: rittexclusions.mod:139)
3. **`<term>` → `<glossterm>`** (in glossary context)
4. **`<listitem>` → `<glossdef>`** (in glossary context)
5. **`<informalfigure>` → `<figure>`** (BANNED: rittexclusions.mod:58)
6. **`<informaltable>` → `<table>`** (BANNED: rittexclusions.mod:59)

### ID Conflict Prevention

**Problem:** HTML IDs are preserved across chapters, causing duplicates:
```xml
<!-- ch0001.xml -->
<sect1 id="introduction">...</sect1>

<!-- ch0002.xml -->
<sect1 id="introduction">...</sect1>  <!-- ERROR: Duplicate ID! -->
```

**Solution:** All IDs are prefixed with `chapter_id`:
```xml
<!-- ch0001.xml -->
<sect1 id="ch0001-introduction">...</sect1>

<!-- ch0002.xml -->
<sect1 id="ch0002-introduction">...</sect1>  <!-- ✓ Unique -->
```

## DTD Compliance Requirements

The RittDoc DTD (based on DocBook 4.3) requires:

### Required Elements in `<bookinfo>`
- `<title>` - Book title (placeholder: "Untitled Book")
- `<isbn>` - ISBN number (placeholder: "0000000000000")
- `<author>` or `<authorgroup>` - At least one author
- `<publisher>/<publishername>` - Publisher name
- `<pubdate>` - Publication date
- `<edition>` - Edition information
- `<copyright>/<year>` - Copyright year (required!)
- `<copyright>/<holder>` - Copyright holder

### Section Structure
- Use numbered sections: `<sect1>`, `<sect2>`, `<sect3>`, `<sect4>`, `<sect5>`
- NOT generic `<section>` elements
- Maximum nesting depth: 5 levels

### Author Structure
```xml
<author>
  <personname>
    <firstname>First</firstname>
    <surname>Last</surname>
  </personname>
</author>
```

### Copyright Structure
```xml
<copyright>
  <year>2024</year>
  <holder>Publisher Name</holder>
</copyright>
```

## Validation Fixes

### Fixed Issues

1. **Localhost Dependency** (RESOLVED)
   - **Issue:** DOCTYPE referenced `http://LOCALHOST/dtd/V1.1/RittDocBook.dtd`
   - **Fix:** Changed to relative path `RITTDOCdtd/v1.1/RittDocBook.dtd`
   - **File:** `package.py:29`

2. **Disabled Validation** (RESOLVED)
   - **Issue:** Validation was commented out due to localhost dependency
   - **Fix:** Re-enabled validation with proper error reporting
   - **File:** `integrated_pipeline.py:285-292`

3. **Missing DTD in Package** (RESOLVED)
   - **Issue:** DTD files not included in ZIP, validation relied on workspace fallback
   - **Fix:** Added code to include all DTD files in package
   - **File:** `package.py:1711-1734`

## Testing Validation

To test the validation features:

1. **Run the full pipeline on a test document:**
   ```bash
   python integrated_pipeline.py test.epub Output/
   ```
   Watch for validation output in Step 6.

2. **Validate an existing package:**
   ```bash
   python validate_rittdoc.py Output/test.zip
   ```

3. **Transform and validate XML:**
   ```bash
   python xslt_transformer.py structured.xml compliant.xml --validate RITTDOCdtd/v1.1/RittDocBook.dtd
   ```

4. **Use the standalone validation script:**
   ```bash
   python validate_rittdoc.py --verbose Output/mybook.zip
   ```

## Error Handling

### Common Validation Errors

1. **Missing `<year>` in `<copyright>`**
   - XSLT automatically adds placeholder year if missing

2. **Generic `<section>` instead of `<sect1-5>`**
   - XSLT automatically converts based on nesting depth

3. **Missing required `<bookinfo>` elements**
   - XSLT adds placeholders for missing elements

4. **Invalid element nesting**
   - Check DTD documentation in `RITTDOCdtd/v1.1/`

### Validation Failure Handling

If validation fails:
1. Check the error log in the console output
2. Review the DTD requirements in `RITTDOCdtd/v1.1/RittDocBook.dtd`
3. Use the standalone validation script with `--verbose` flag
4. Review the intermediate `structured_compliant.xml` file

## Files Modified

### New Files
- `xslt/rittdoc_compliance.xslt` - XSLT transformation stylesheet
- `xslt_transformer.py` - Python XSLT transformation module
- `validate_rittdoc.py` - Standalone validation script
- `XSLT_DTD_VALIDATION.md` - This documentation

### Modified Files
- `package.py:29` - Fixed localhost dependency in DOCTYPE
- `package.py:1711-1734` - Added DTD files to ZIP package
- `integrated_pipeline.py:18` - Added XSLT transformer import
- `integrated_pipeline.py:256-267` - Added XSLT transformation step
- `integrated_pipeline.py:285-292` - Enabled DTD validation
- `integrated_pipeline.py:335-346` - Updated validation status messages

## Future Enhancements

Potential improvements for consideration:

1. **XSLT 2.0 Support** - Use Saxon for more advanced transformations
2. **Custom Validation Rules** - Add Schematron validation for business rules
3. **Validation Reports** - Generate detailed HTML validation reports
4. **Auto-Fix Mode** - Automatically fix common validation errors
5. **Validation Cache** - Cache validation results to speed up re-validation

## References

- RittDoc DTD: `RITTDOCdtd/v1.1/RittDocBook.dtd`
- DocBook 4.3 Reference: https://docbook.org/tdg/en/html/docbook.html
- XSLT 1.0 Specification: https://www.w3.org/TR/xslt-10/
- lxml Documentation: https://lxml.de/

## Support

For issues or questions about DTD validation:
1. Check this documentation
2. Review DTD files in `RITTDOCdtd/v1.1/`
3. Run validation with `--verbose` flag
4. Check intermediate XML files in `Output/{isbn}_intermediate/`
