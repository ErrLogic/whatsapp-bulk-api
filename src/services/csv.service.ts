import csv from 'csv-parser';
import fs from 'fs';
import type {ContactData} from '../types';

export class CSVService {
    async parseCSV(filePath: string): Promise<ContactData[]> {
        const contacts: ContactData[] = [];
        let separator = ','; // Default separator

        return new Promise((resolve, reject) => {
            // First detect the separator
            fs.createReadStream(filePath)
                .on('data', (chunk) => {
                    const firstLine = chunk.toString().split('\n')[0];
                    if (firstLine?.includes(';')) {
                        separator = ';';
                    }
                    // Rewind the stream
                    this.createStreamWithSeparator(filePath, separator, contacts, resolve, reject);
                })
                .on('error', reject);
        });
    }

    private createStreamWithSeparator(
        filePath: string,
        separator: string,
        contacts: ContactData[],
        resolve: (value: ContactData[]) => void,
        reject: (reason?: any) => void
    ) {
        fs.createReadStream(filePath)
            .pipe(csv({
                separator,
                mapHeaders: ({ header }) => header.toLowerCase().trim(),
                strict: false
            }))
            .on('data', (row) => {
                // Normalize field access
                const normalizedRow: any = {};
                Object.keys(row).forEach(key => {
                    normalizedRow[key.toLowerCase().trim()] = row[key];
                });

                const name = normalizedRow.name || normalizedRow.contact_name || '';
                const phone = normalizedRow.phone || normalizedRow.phone_number || normalizedRow.mobile || '';

                if (name && phone) {
                    // Clean phone number (remove all non-digit characters)
                    const cleanedPhone = phone.toString().replace(/\D/g, '');

                    contacts.push({
                        name: name.toString().trim(),
                        phone: cleanedPhone
                    });
                }
            })
            .on('end', () => resolve(contacts))
            .on('error', reject);
    }
}